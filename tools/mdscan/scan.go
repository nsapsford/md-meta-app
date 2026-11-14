package main

// Image descriptors, the card database and board scanning. Platform independent:
// the Windows build adds screen capture, hotkeys and the clipboard on top.

import (
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"errors"
	"io"
	"math"
	"math/bits"
	"sort"
)

// ── Images ──

// Img is 8-bit RGB, row-major.
type Img struct {
	W, H int
	Pix  []uint8
}

func (im *Img) px(x, y int) (float64, float64, float64) {
	if x < 0 {
		x = 0
	} else if x >= im.W {
		x = im.W - 1
	}
	if y < 0 {
		y = 0
	} else if y >= im.H {
		y = im.H - 1
	}
	i := (y*im.W + x) * 3
	return float64(im.Pix[i]), float64(im.Pix[i+1]), float64(im.Pix[i+2])
}

// bilinear sample at a sub-pixel position.
func (im *Img) at(x, y float64) (float64, float64, float64) {
	x -= 0.5
	y -= 0.5
	x0, y0 := math.Floor(x), math.Floor(y)
	fx, fy := x-x0, y-y0
	ix, iy := int(x0), int(y0)
	r00, g00, b00 := im.px(ix, iy)
	r10, g10, b10 := im.px(ix+1, iy)
	r01, g01, b01 := im.px(ix, iy+1)
	r11, g11, b11 := im.px(ix+1, iy+1)
	l := func(a, b, c, d float64) float64 {
		return (a*(1-fx)+b*fx)*(1-fy) + (c*(1-fx)+d*fx)*fy
	}
	return l(r00, r10, r01, r11), l(g00, g10, g01, g11), l(b00, b10, b01, b11)
}

type Pt struct{ X, Y float64 }

// Quad corners in order: top-left, top-right, bottom-right, bottom-left (of the card as it is read).
type Quad [4]Pt

// Projective map from the unit square onto a quad.
type homog [9]float64

func squareToQuad(q Quad) homog {
	x0, y0 := q[0].X, q[0].Y
	x1, y1 := q[1].X, q[1].Y
	x2, y2 := q[2].X, q[2].Y
	x3, y3 := q[3].X, q[3].Y
	dx1, dy1 := x1-x2, y1-y2
	dx2, dy2 := x3-x2, y3-y2
	sx, sy := x0-x1+x2-x3, y0-y1+y2-y3
	var g, h float64
	if math.Abs(sx) > 1e-9 || math.Abs(sy) > 1e-9 {
		den := dx1*dy2 - dx2*dy1
		g = (sx*dy2 - dx2*sy) / den
		h = (dx1*sy - sx*dy1) / den
	}
	a := x1 - x0 + g*x1
	b := x3 - x0 + h*x3
	c := x0
	d := y1 - y0 + g*y1
	e := y3 - y0 + h*y3
	f := y0
	return homog{a, b, c, d, e, f, g, h, 1}
}

func (m homog) apply(u, v float64) (float64, float64) {
	w := m[6]*u + m[7]*v + m[8]
	return (m[0]*u + m[1]*v + m[2]) / w, (m[3]*u + m[4]*v + m[5]) / w
}

// Sub-quad of a quad, in the quad's own unit coordinates.
func subQuad(q Quad, u0, v0, u1, v1 float64) Quad {
	m := squareToQuad(q)
	p := func(u, v float64) Pt { x, y := m.apply(u, v); return Pt{x, y} }
	return Quad{p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)}
}

const N = 32 // sampling grid for a descriptor

// sample an N×N RGB grid from a quad, averaging 3×3 sub-samples per cell
// (anti-aliasing matters: field cards are small, database cards are large).
func sampleQuad(im *Img, q Quad) []float64 {
	m := squareToQuad(q)
	out := make([]float64, N*N*3)
	const S = 3
	for j := 0; j < N; j++ {
		for i := 0; i < N; i++ {
			var r, g, b float64
			for sj := 0; sj < S; sj++ {
				for si := 0; si < S; si++ {
					u := (float64(i) + (float64(si)+0.5)/S) / N
					v := (float64(j) + (float64(sj)+0.5)/S) / N
					x, y := m.apply(u, v)
					rr, gg, bb := im.at(x, y)
					r += rr
					g += gg
					b += bb
				}
			}
			k := (j*N + i) * 3
			out[k], out[k+1], out[k+2] = r/(S*S), g/(S*S), b/(S*S)
		}
	}
	return out
}

// ── Descriptors ──

type Desc struct {
	Hash uint64
	Col  [48]uint8  // 4×4 grid of mean colour, global tint removed
	Gray [256]uint8 // 16×16 grey, normalised for contrast
}

var dctCos [8][N]float64

func init() {
	for u := 0; u < 8; u++ {
		for x := 0; x < N; x++ {
			dctCos[u][x] = math.Cos(float64(2*x+1) * float64(u) * math.Pi / (2 * N))
		}
	}
}

func clamp8(v float64) uint8 {
	if v < 0 {
		return 0
	}
	if v > 255 {
		return 255
	}
	return uint8(v + 0.5)
}

func describe(rgb []float64) Desc {
	var d Desc
	gray := make([]float64, N*N)
	var mr, mg, mb float64
	for i := 0; i < N*N; i++ {
		r, g, b := rgb[i*3], rgb[i*3+1], rgb[i*3+2]
		gray[i] = 0.299*r + 0.587*g + 0.114*b
		mr += r
		mg += g
		mb += b
	}
	mr /= N * N
	mg /= N * N
	mb /= N * N
	// perceptual hash: low-frequency DCT signs against the median
	var tmp [8][N]float64
	for u := 0; u < 8; u++ {
		for y := 0; y < N; y++ {
			s := 0.0
			for x := 0; x < N; x++ {
				s += gray[y*N+x] * dctCos[u][x]
			}
			tmp[u][y] = s
		}
	}
	var co [64]float64
	for v := 0; v < 8; v++ {
		for u := 0; u < 8; u++ {
			s := 0.0
			for y := 0; y < N; y++ {
				s += tmp[u][y] * dctCos[v][y]
			}
			co[v*8+u] = s
		}
	}
	vals := append([]float64(nil), co[1:]...)
	sort.Float64s(vals)
	med := vals[len(vals)/2]
	for k := 1; k < 64; k++ {
		if co[k] > med {
			d.Hash |= 1 << uint(k)
		}
	}
	// colour grid
	for gy := 0; gy < 4; gy++ {
		for gx := 0; gx < 4; gx++ {
			var r, g, b float64
			for y := gy * 8; y < gy*8+8; y++ {
				for x := gx * 8; x < gx*8+8; x++ {
					k := (y*N + x) * 3
					r += rgb[k]
					g += rgb[k+1]
					b += rgb[k+2]
				}
			}
			c := (gy*4 + gx) * 3
			d.Col[c] = clamp8(r/64 - mr + 128)
			d.Col[c+1] = clamp8(g/64 - mg + 128)
			d.Col[c+2] = clamp8(b/64 - mb + 128)
		}
	}
	// 16×16 grey, mean 128, sd 40
	var g16 [256]float64
	var mean, sd float64
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			s := gray[(2*y)*N+2*x] + gray[(2*y)*N+2*x+1] + gray[(2*y+1)*N+2*x] + gray[(2*y+1)*N+2*x+1]
			g16[y*16+x] = s / 4
			mean += s / 4
		}
	}
	mean /= 256
	for _, v := range g16 {
		sd += (v - mean) * (v - mean)
	}
	sd = math.Sqrt(sd/256) + 1e-6
	for i, v := range g16 {
		d.Gray[i] = clamp8((v-mean)/sd*40 + 128)
	}
	return d
}

func describeQuad(im *Img, q Quad) Desc { return describe(sampleQuad(im, q)) }

// Plain contrast of a region (low = flat background).
func regionStats(im *Img, q Quad) (mean, sd float64, gray []float64) {
	rgb := sampleQuad(im, q)
	gray = make([]float64, N*N)
	for i := range gray {
		gray[i] = 0.299*rgb[i*3] + 0.587*rgb[i*3+1] + 0.114*rgb[i*3+2]
		mean += gray[i]
	}
	mean /= float64(len(gray))
	for _, v := range gray {
		sd += (v - mean) * (v - mean)
	}
	return mean, math.Sqrt(sd / float64(len(gray))), gray
}

func ncc(a, b *[256]uint8) float64 {
	var s, sa, sb float64
	for i := 0; i < 256; i++ {
		x, y := float64(a[i])-128, float64(b[i])-128
		s += x * y
		sa += x * x
		sb += y * y
	}
	return s / (math.Sqrt(sa*sb) + 1e-9)
}

func colDist(a, b *[48]uint8) float64 {
	s := 0
	for i := 0; i < 48; i++ {
		d := int(a[i]) - int(b[i])
		if d < 0 {
			d = -d
		}
		s += d
	}
	return float64(s) / (48 * 255)
}

// Similarity in roughly [-1, 1]; higher is better.
func similarity(a, b *Desc) float64 {
	h := float64(bits.OnesCount64(a.Hash ^ b.Hash))
	return ncc(&a.Gray, &b.Gray) - 2.5*colDist(&a.Col, &b.Col) - 0.004*h
}

// ── Card database ──

type Card struct {
	ID   uint32
	Name string
	Kind uint8 // 0 main-deck monster, 1 fusion, 2 synchro, 3 xyz, 4 link, 5 spell, 6 trap
	ATK  int16
	DEF  int16
	Art  Desc // the illustration
	Full Desc // the whole card
}

func (c *Card) Monster() bool { return c.Kind <= 4 }

type DB struct {
	Cards []Card
	// views used for the coarse prefilter
	artHash, fullHash []uint64
}

func encodeDesc(w io.Writer, d *Desc) {
	binary.Write(w, binary.LittleEndian, d.Hash)
	w.Write(d.Col[:])
	w.Write(d.Gray[:])
}

func decodeDesc(r io.Reader, d *Desc) error {
	if err := binary.Read(r, binary.LittleEndian, &d.Hash); err != nil {
		return err
	}
	if _, err := io.ReadFull(r, d.Col[:]); err != nil {
		return err
	}
	_, err := io.ReadFull(r, d.Gray[:])
	return err
}

func (db *DB) Encode() []byte {
	var raw bytes.Buffer
	raw.WriteString("MDSCAN1\n")
	binary.Write(&raw, binary.LittleEndian, uint32(len(db.Cards)))
	for i := range db.Cards {
		c := &db.Cards[i]
		binary.Write(&raw, binary.LittleEndian, c.ID)
		binary.Write(&raw, binary.LittleEndian, uint16(len(c.Name)))
		raw.WriteString(c.Name)
		raw.WriteByte(c.Kind)
		binary.Write(&raw, binary.LittleEndian, c.ATK)
		binary.Write(&raw, binary.LittleEndian, c.DEF)
		encodeDesc(&raw, &c.Art)
		encodeDesc(&raw, &c.Full)
	}
	var out bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&out, gzip.BestCompression)
	zw.Write(raw.Bytes())
	zw.Close()
	return out.Bytes()
}

func DecodeDB(b []byte) (*DB, error) {
	zr, err := gzip.NewReader(bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	raw, err := io.ReadAll(zr)
	if err != nil {
		return nil, err
	}
	r := bytes.NewReader(raw)
	magic := make([]byte, 8)
	io.ReadFull(r, magic)
	if string(magic) != "MDSCAN1\n" {
		return nil, errors.New("not a card database")
	}
	var n uint32
	binary.Read(r, binary.LittleEndian, &n)
	db := &DB{Cards: make([]Card, n)}
	for i := range db.Cards {
		c := &db.Cards[i]
		var nl uint16
		binary.Read(r, binary.LittleEndian, &c.ID)
		binary.Read(r, binary.LittleEndian, &nl)
		nm := make([]byte, nl)
		io.ReadFull(r, nm)
		c.Name = string(nm)
		k, _ := r.ReadByte()
		c.Kind = k
		binary.Read(r, binary.LittleEndian, &c.ATK)
		binary.Read(r, binary.LittleEndian, &c.DEF)
		if err := decodeDesc(r, &c.Art); err != nil {
			return nil, err
		}
		if err := decodeDesc(r, &c.Full); err != nil {
			return nil, err
		}
	}
	db.index()
	return db, nil
}

func (db *DB) index() {
	db.artHash = make([]uint64, len(db.Cards))
	db.fullHash = make([]uint64, len(db.Cards))
	for i := range db.Cards {
		db.artHash[i] = db.Cards[i].Art.Hash
		db.fullHash[i] = db.Cards[i].Full.Hash
	}
}

type Match struct {
	Card  *Card
	Score float64
}

// Best matches for a query descriptor, against the art or whole-card view.
// filter: 0 any, 1 monsters only, 2 spells/traps only.
func (db *DB) Lookup(q *Desc, full bool, filter int, k int) []Match {
	hs := db.artHash
	if full {
		hs = db.fullHash
	}
	type cand struct {
		i int
		h int
	}
	const pre = 160
	best := make([]cand, 0, pre+1)
	worst := 65
	for i, h := range hs {
		c := &db.Cards[i]
		if filter == 1 && !c.Monster() || filter == 2 && c.Monster() {
			continue
		}
		d := bits.OnesCount64(h ^ q.Hash)
		if len(best) == pre && d >= worst {
			continue
		}
		j := len(best)
		best = append(best, cand{i, d})
		for j > 0 && best[j-1].h > d {
			best[j], best[j-1] = best[j-1], best[j]
			j--
		}
		if len(best) > pre {
			best = best[:pre]
		}
		worst = best[len(best)-1].h
	}
	out := make([]Match, 0, len(best))
	for _, b := range best {
		c := &db.Cards[b.i]
		d := &c.Art
		if full {
			d = &c.Full
		}
		out = append(out, Match{c, similarity(q, d)})
	}
	sort.Slice(out, func(a, b int) bool { return out[a].Score > out[b].Score })
	if len(out) > k {
		out = out[:k]
	}
	return out
}

// ── Card geometry ──

// Where the illustration sits on a card, as fractions of the card (standard frames).
func artBox(kind uint8, pendulum bool) (u0, v0, u1, v1 float64) {
	if pendulum {
		return 0.072, 0.183, 0.928, 0.628
	}
	return 0.13, 0.19, 0.87, 0.695
}
