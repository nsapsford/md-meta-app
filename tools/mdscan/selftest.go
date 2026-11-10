package main

// "mdscan selftest <db> <image dir> [n]": draws real cards onto a synthetic field in
// perspective (small, compressed, tinted), scans it, and reports how many were read right.

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"math"
	"math/rand"
	"os"
	"path/filepath"
	"strconv"
)

func inv3(m homog) homog {
	a, b, c, d, e, f, g, h, i := m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]
	A, B, C := e*i-f*h, -(d*i - f*g), d*h-e*g
	det := a*A + b*B + c*C
	return homog{A / det, -(b*i - c*h) / det, (b*f - c*e) / det, B / det, (a*i - c*g) / det, -(a*f - c*d) / det, C / det, -(a*h - b*g) / det, (a*e - b*d) / det}
}

// draw src (its sub-rectangle u0..u1, v0..v1) into dst over quad q.
func drawInto(dst *Img, src *Img, q Quad, u0, v0, u1, v1 float64) {
	m := squareToQuad(q)
	mi := inv3(m)
	minX, minY, maxX, maxY := q[0].X, q[0].Y, q[0].X, q[0].Y
	for _, p := range q {
		minX, minY = math.Min(minX, p.X), math.Min(minY, p.Y)
		maxX, maxY = math.Max(maxX, p.X), math.Max(maxY, p.Y)
	}
	const S = 3
	for y := int(minY) - 1; y <= int(maxY)+1; y++ {
		for x := int(minX) - 1; x <= int(maxX)+1; x++ {
			if x < 0 || y < 0 || x >= dst.W || y >= dst.H {
				continue
			}
			var r, g, b float64
			n := 0
			for sy := 0; sy < S; sy++ {
				for sx := 0; sx < S; sx++ {
					px, py := float64(x)+(float64(sx)+0.5)/S, float64(y)+(float64(sy)+0.5)/S
					u, v := mi.apply(px, py)
					if u < 0 || v < 0 || u > 1 || v > 1 {
						continue
					}
					su := (u0 + (u1-u0)*u) * float64(src.W)
					sv := (v0 + (v1-v0)*v) * float64(src.H)
					rr, gg, bb := src.at(su, sv)
					r, g, b = r+rr, g+gg, b+bb
					n++
				}
			}
			if n == 0 {
				continue
			}
			k := (y*dst.W + x) * 3
			f := float64(n) / (S * S)
			dst.Pix[k] = clamp8(float64(dst.Pix[k])*(1-f) + r/(S*S))
			dst.Pix[k+1] = clamp8(float64(dst.Pix[k+1])*(1-f) + g/(S*S))
			dst.Pix[k+2] = clamp8(float64(dst.Pix[k+2])*(1-f) + b/(S*S))
		}
	}
}

func jpegRound(im *Img, q int) *Img {
	rgba := image.NewRGBA(image.Rect(0, 0, im.W, im.H))
	for i, j := 0, 0; j < len(im.Pix); i, j = i+4, j+3 {
		rgba.Pix[i], rgba.Pix[i+1], rgba.Pix[i+2], rgba.Pix[i+3] = im.Pix[j], im.Pix[j+1], im.Pix[j+2], 255
	}
	var buf bytes.Buffer
	jpeg.Encode(&buf, rgba, &jpeg.Options{Quality: q})
	dec, _ := jpeg.Decode(&buf)
	return fromImage(dec)
}

func synthField(rng *rand.Rand, w, h int) *Img {
	im := &Img{W: w, H: h, Pix: make([]uint8, w*h*3)}
	br, bg, bb := 40+rng.Float64()*60, 60+rng.Float64()*60, 50+rng.Float64()*80
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			n := math.Sin(float64(x)/37) * math.Cos(float64(y)/23) * 18
			k := (y*w + x) * 3
			im.Pix[k] = clamp8(br + n + rng.Float64()*10)
			im.Pix[k+1] = clamp8(bg + n + rng.Float64()*10)
			im.Pix[k+2] = clamp8(bb + n + rng.Float64()*10)
		}
	}
	return im
}

func testCalib() *Calib {
	return &Calib{ScreenW: 1600, ScreenH: 900, M1: Pt{520, 560}, M5: Pt{1080, 560}, S1: Pt{560, 430}, S5: Pt{1040, 430}}
}

func selftest(dbPath, imgDir string, n int) error {
	raw, err := os.ReadFile(dbPath)
	if err != nil {
		return err
	}
	db, err := DecodeDB(raw)
	if err != nil {
		return err
	}
	rng := rand.New(rand.NewSource(7))
	c := testCalib()
	type stat struct{ ok, wrong, unsure, total int }
	var st [2]stat // 0: whole card shown, 1: illustration only
	var panel stat
	for t := 0; t < n; t++ {
		mode := t % 2
		bg := synthField(rng, c.ScreenW, c.ScreenH)
		empty := jpegRound(bg, 85)
		c.captureBackground(empty)
		im := &Img{W: bg.W, H: bg.H, Pix: append([]uint8(nil), bg.Pix...)}
		placed := map[int]*Card{}
		for z := 0; z < nZones; z++ {
			if rng.Float64() < 0.45 {
				continue
			}
			filter := 1
			if z >= 5 && z < 10 {
				filter = 2
			}
			var cd *Card
			for cd == nil {
				x := &db.Cards[rng.Intn(len(db.Cards))]
				if filter == 1 && x.Monster() || filter == 2 && !x.Monster() {
					cd = x
				}
			}
			src, err := loadImage(filepath.Join(imgDir, strconv.Itoa(int(cd.ID))+".jpg"))
			if err != nil {
				continue
			}
			ctr, u, v, d := c.zoneFrame(z)
			k := 0.5 + rng.Float64()*0.26
			a := 1.0 + rng.Float64()*0.45
			ctr = add(ctr, Pt{(rng.Float64() - 0.5) * d * 0.06, (rng.Float64() - 0.5) * d * 0.06})
			rot := rng.Intn(2)
			q := fieldQuad(ctr, u, v, d*k, d*k*a, rot)
			if (z < 5 || z >= 10) && rng.Float64() < 0.3 {
				q = fieldQuad(ctr, u, v, d*k*1.46, d*k*a/1.46, 2+rng.Intn(2))
			}
			if mode == 0 {
				drawInto(im, src, q, 0, 0, 1, 1)
			} else {
				u0, v0, u1, v1 := artBox(cd.Kind, false)
				drawInto(im, src, q, u0, v0, u1, v1)
			}
			placed[z] = cd
		}
		// lighting, blur by compression
		tint := [3]float64{0.85 + rng.Float64()*0.25, 0.85 + rng.Float64()*0.25, 0.85 + rng.Float64()*0.25}
		for i := range im.Pix {
			im.Pix[i] = clamp8(float64(im.Pix[i]) * tint[i%3])
		}
		im = jpegRound(im, 70)
		found := c.ScanField(db, im)
		got := map[int]Found{}
		for _, f := range found {
			got[f.Zone] = f
		}
		for z, cd := range placed {
			st[mode].total++
			f, ok := got[z]
			if os.Getenv("MDSCAN_DEBUG") != "" && ok {
				fc := f.Card
				if fc == nil {
					fc = &Card{}
				}
				right := fc.Name == cd.Name
				f2 := identify(db, im, c.candidates(z), map[bool]int{true: 2, false: 1}[z >= 5 && z < 10])
				fmt.Printf("DBG %v %.3f %.3f %d | %s | %s\n", f2.Card != nil && f2.Card.Name == cd.Name, f2.Score, f2.Margin, mode, cd.Name, func() string {
					if f2.Card == nil {
						return ""
					}
					return f2.Card.Name
				}())
				_ = right
			}
			switch {
			case !ok || f.Set || f.Card == nil:
				st[mode].unsure++
			case f.Card.ID == cd.ID || f.Card.Name == cd.Name:
				st[mode].ok++
			default:
				st[mode].wrong++
			}
		}
		// detail panel: one large flat card, illustration only
		{
			cd := &db.Cards[rng.Intn(len(db.Cards))]
			src, err := loadImage(filepath.Join(imgDir, strconv.Itoa(int(cd.ID))+".jpg"))
			if err == nil {
				p := synthField(rng, 600, 600)
				tl, br := Pt{100, 80}, Pt{420, 400}
				u0, v0, u1, v1 := artBox(cd.Kind, false)
				drawInto(p, src, Quad{tl, {br.X, tl.Y}, br, {tl.X, br.Y}}, u0, v0, u1, v1)
				p = jpegRound(p, 75)
				pc := &Calib{PanelTL: &Pt{tl.X + 3, tl.Y - 2}, PanelBR: &Pt{br.X - 2, br.Y + 3}}
				f := pc.ScanPanel(db, p)
				panel.total++
				switch {
				case !confident(f):
					panel.unsure++
				case f.Card.Name == cd.Name:
					panel.ok++
				default:
					panel.wrong++
				}
			}
		}
	}
	pr := func(name string, s stat) {
		fmt.Printf("%-34s %4d cards: %5.1f%% right, %5.1f%% wrong, %5.1f%% left as unknown\n", name, s.total,
			100*float64(s.ok)/float64(s.total), 100*float64(s.wrong)/float64(s.total), 100*float64(s.unsure)/float64(s.total))
	}
	pr("field, whole card shown", st[0])
	pr("field, illustration only", st[1])
	pr("detail panel", panel)
	return nil
}
