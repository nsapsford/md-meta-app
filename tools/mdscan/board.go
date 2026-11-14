package main

// Where their cards sit on screen, and turning a screenshot into a board.

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"sort"
	"strings"
	"sync"
)

// Calib holds the points the player marked once for their screen.
type Calib struct {
	ScreenW, ScreenH int         // capture size the points belong to
	OX, OY           int         // top-left of the captured area in screen coordinates
	M1, M5           Pt          // centres of their monster zones 1 and 5 (the row nearer you)
	S1, S5           Pt          // centres of their Spell/Trap zones 1 and 5 (the far row)
	PanelTL, PanelBR *Pt         // optional: the card picture in the card detail panel
	BG               [][]float64 `json:",omitempty"` // empty-field reference per zone
}

const nZones = 12 // 0-4 their monster zones, 5-9 their Spell/Trap zones, 10-11 Extra Monster Zones

func zoneName(z int) string {
	switch {
	case z < 5:
		return fmt.Sprintf("monster zone %d", z+1)
	case z < 10:
		return fmt.Sprintf("Spell/Trap zone %d", z-4)
	}
	return fmt.Sprintf("Extra Monster Zone %d", z-9)
}

func lerp(a, b Pt, t float64) Pt { return Pt{a.X + (b.X-a.X)*t, a.Y + (b.Y-a.Y)*t} }
func sub(a, b Pt) Pt             { return Pt{a.X - b.X, a.Y - b.Y} }
func add(a, b Pt) Pt             { return Pt{a.X + b.X, a.Y + b.Y} }
func mul(a Pt, k float64) Pt     { return Pt{a.X * k, a.Y * k} }
func norm(a Pt) float64          { return math.Hypot(a.X, a.Y) }
func unit(a Pt) Pt               { n := norm(a) + 1e-9; return Pt{a.X / n, a.Y / n} }

// zoneFrame: centre, row direction u (unit), column direction v (unit, towards you), zone spacing.
func (c *Calib) zoneFrame(z int) (Pt, Pt, Pt, float64) {
	col := func(i int) (Pt, Pt) { return lerp(c.M1, c.M5, float64(i)/4), lerp(c.S1, c.S5, float64(i)/4) }
	switch {
	case z < 5:
		m, s := col(z)
		return m, unit(sub(c.M5, c.M1)), unit(sub(m, s)), norm(sub(c.M5, c.M1)) / 4
	case z < 10:
		m, s := col(z - 5)
		return s, unit(sub(c.S5, c.S1)), unit(sub(m, s)), norm(sub(c.S5, c.S1)) / 4
	}
	// Extra Monster Zones: columns 2 and 4, one row nearer you than their monster zones.
	i := 1
	if z == 11 {
		i = 3
	}
	m, s := col(i)
	step := sub(m, s)
	e := add(m, step)
	spacing := norm(sub(c.M5, c.M1)) / 4 * (norm(sub(c.M5, c.M1)) / (norm(sub(c.S5, c.S1)) + 1e-9))
	return e, unit(sub(c.M5, c.M1)), unit(step), spacing
}

// A card-shaped quad on the field. wu/hv: extent along u and v. rot: 0 upright to you,
// 1 upside down (facing them), 2 and 3 sideways (Defense Position).
func fieldQuad(c, u, v Pt, wu, hv float64, rot int) Quad {
	tl := add(c, add(mul(u, -wu/2), mul(v, -hv/2)))
	tr := add(c, add(mul(u, wu/2), mul(v, -hv/2)))
	br := add(c, add(mul(u, wu/2), mul(v, hv/2)))
	bl := add(c, add(mul(u, -wu/2), mul(v, hv/2)))
	switch rot {
	case 1:
		return Quad{br, bl, tl, tr}
	case 2: // card top pointing left
		return Quad{bl, tl, tr, br}
	case 3: // card top pointing right
		return Quad{tr, br, bl, tl}
	}
	return Quad{tl, tr, br, bl}
}

func (c *Calib) baseQuad(z int) Quad {
	ctr, u, v, d := c.zoneFrame(z)
	return fieldQuad(ctr, u, v, d*0.8, d*0.8, 0)
}

type Found struct {
	Zone    int
	Card    *Card
	Score   float64
	Margin  float64
	Defense bool
	Set     bool // something is there but it isn't a face-up card we know
	Alt     []Match
}

// Thresholds, tuned on synthetic boards (see selftest.go).
var (
	matchMin  = 0.48 // accept a match at or above this score
	marginMin = 0.06 // and at least this far ahead of the next different card
	occupied  = 14.0 // mean grey difference from the empty field that means "a card is here"
)

func (c *Calib) occupiedness(im *Img, z int) float64 {
	if len(c.BG) != nZones || len(c.BG[z]) != N*N {
		return -1
	}
	_, _, g := regionStats(im, c.baseQuad(z))
	s := 0.0
	for i, v := range g {
		s += math.Abs(v - c.BG[z][i])
	}
	return s / float64(len(g))
}

type cand struct {
	q       Quad
	defense bool
}

func (c *Calib) candidates(z int) []cand {
	ctr, u, v, d := c.zoneFrame(z)
	var out []cand
	for _, k := range []float64{0.50, 0.62, 0.75} {
		for _, a := range []float64{0.95, 1.2, 1.45} {
			w := d * k
			for rot := 0; rot < 2; rot++ {
				out = append(out, cand{fieldQuad(ctr, u, v, w, w*a, rot), false})
			}
			if z < 5 || z >= 10 {
				for rot := 2; rot < 4; rot++ {
					out = append(out, cand{fieldQuad(ctr, u, v, w*1.46, w*a/1.46, rot), true})
				}
			}
		}
	}
	return out
}

// identify: best card for a set of candidate quads. Each quad is tried as a whole card,
// as an illustration, and through the illustration box of a whole card.
func identify(db *DB, im *Img, cands []cand, filter int) (best Found) {
	type hit struct {
		m Match
		d bool
	}
	var hits []hit
	for _, cd := range cands {
		dq := describeQuad(im, cd.q)
		for _, m := range db.Lookup(&dq, true, filter, 3) {
			hits = append(hits, hit{m, cd.defense})
		}
		for _, m := range db.Lookup(&dq, false, filter, 3) {
			hits = append(hits, hit{m, cd.defense})
		}
		u0, v0, u1, v1 := artBox(0, false)
		da := describeQuad(im, subQuad(cd.q, u0, v0, u1, v1))
		for _, m := range db.Lookup(&da, false, filter, 3) {
			hits = append(hits, hit{m, cd.defense})
		}
	}
	if len(hits) == 0 {
		return
	}
	sort.Slice(hits, func(a, b int) bool { return hits[a].m.Score > hits[b].m.Score })
	best.Card, best.Score, best.Defense = hits[0].m.Card, hits[0].m.Score, hits[0].d
	seen := map[uint32]bool{best.Card.ID: true}
	best.Margin = best.Score + 1
	for _, h := range hits[1:] {
		if seen[h.m.Card.ID] {
			continue
		}
		if best.Margin > best.Score {
			best.Margin = best.Score - h.m.Score
		}
		seen[h.m.Card.ID] = true
		best.Alt = append(best.Alt, h.m)
		if len(best.Alt) == 3 {
			break
		}
	}
	if best.Margin > best.Score {
		best.Margin = 1
	}
	return
}

func confident(f Found) bool { return f.Card != nil && f.Score >= matchMin && f.Margin >= marginMin }

// ScanField reads every zone. Zones with nothing on them are left out.
func (c *Calib) ScanField(db *DB, im *Img) []Found {
	out := make([]Found, nZones)
	var wg sync.WaitGroup
	for z := 0; z < nZones; z++ {
		wg.Add(1)
		go func(z int) {
			defer wg.Done()
			occ := c.occupiedness(im, z)
			if occ >= 0 && occ < occupied {
				out[z].Zone = -1
				return
			}
			filter := 1
			if z >= 5 && z < 10 {
				filter = 2
			}
			f := identify(db, im, c.candidates(z), filter)
			f.Zone = z
			if !confident(f) {
				if occ < 0 && z >= 10 { // no empty-field reference: don't guess about the Extra Monster Zones
					f.Zone = -1
				}
				f.Set = true
			}
			out[z] = f
		}(z)
	}
	wg.Wait()
	var res []Found
	for _, f := range out {
		if f.Zone >= 0 {
			res = append(res, f)
		}
	}
	return res
}

// ScanPanel reads the card shown in the card detail panel.
func (c *Calib) ScanPanel(db *DB, im *Img) Found {
	tl, br := *c.PanelTL, *c.PanelBR
	q := Quad{tl, {br.X, tl.Y}, br, {tl.X, br.Y}}
	var cands []cand
	for _, s := range []float64{0, 0.04} { // also a slightly inset crop, in case the marked box includes a border
		cands = append(cands, cand{subQuad(q, s, s, 1-s, 1-s), false})
	}
	f := identify(db, im, cands, 0)
	f.Zone = -1
	return f
}

// ── Output for the line finder ──

type boardCard struct {
	Name  string   `json:"name"`
	Pos   string   `json:"pos,omitempty"`
	Zone  string   `json:"zone,omitempty"`
	Conf  float64  `json:"conf"`
	Set   bool     `json:"set,omitempty"`
	Guess string   `json:"guess,omitempty"` // unsure: the scanner's best guess, for you to confirm
	Alts  []string `json:"alts,omitempty"`
}

type boardOut struct {
	MDBoard int         `json:"mdboard"`
	Mons    []boardCard `json:"mons"`
	ST      []boardCard `json:"st"`
}

func toBoard(found []Found) boardOut {
	b := boardOut{MDBoard: 1, Mons: []boardCard{}, ST: []boardCard{}}
	for _, f := range found {
		bc := boardCard{Zone: zoneName(f.Zone), Conf: math.Round(f.Score*100) / 100, Set: f.Set}
		if !f.Set && f.Card != nil {
			bc.Name = f.Card.Name
			for _, a := range f.Alt {
				bc.Alts = append(bc.Alts, a.Card.Name)
			}
		} else if f.Card != nil && f.Score >= 0.3 {
			bc.Guess = f.Card.Name
		}
		monsterZone := f.Zone < 5 || f.Zone >= 10 || f.Zone == -1 && f.Card != nil && f.Card.Monster()
		if monsterZone {
			bc.Pos = "atk"
			if f.Set {
				bc.Pos = "set"
			} else if f.Defense {
				bc.Pos = "def"
			}
			b.Mons = append(b.Mons, bc)
		} else {
			b.ST = append(b.ST, bc)
		}
	}
	return b
}

func (b boardOut) Text() string {
	j, _ := json.Marshal(b)
	return string(j)
}

func (b boardOut) Summary() string {
	var sb strings.Builder
	line := func(c boardCard) {
		switch {
		case c.Set && c.Guess != "":
			fmt.Fprintf(&sb, "  %-26s not sure: maybe %s (or face-down)\n", c.Zone, c.Guess)
		case c.Set && c.Pos == "set":
			fmt.Fprintf(&sb, "  %-26s face-down monster\n", c.Zone)
		case c.Set:
			fmt.Fprintf(&sb, "  %-26s face-down card\n", c.Zone)
		default:
			pos := ""
			if c.Pos == "def" {
				pos = " (Defense)"
			}
			warn := ""
			if c.Conf < matchMin+0.1 {
				warn = "   <- check: maybe " + strings.Join(c.Alts, " / ")
			}
			fmt.Fprintf(&sb, "  %-26s %s%s  [%.2f]%s\n", c.Zone, c.Name, pos, c.Conf, warn)
		}
	}
	for _, c := range b.Mons {
		line(c)
	}
	for _, c := range b.ST {
		line(c)
	}
	if sb.Len() == 0 {
		return "  their field looks empty\n"
	}
	return sb.String()
}

// ── Calibration file ──

func loadCalib(path string) (map[string]*Calib, error) {
	m := map[string]*Calib{}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return m, nil
		}
		return nil, err
	}
	return m, json.Unmarshal(b, &m)
}

func saveCalib(path string, m map[string]*Calib) error {
	b, err := json.MarshalIndent(m, "", " ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}

func resKey(w, h int) string { return fmt.Sprintf("%dx%d", w, h) }

// captureBackground stores what each empty zone looks like.
func (c *Calib) captureBackground(im *Img) {
	c.BG = make([][]float64, nZones)
	for z := 0; z < nZones; z++ {
		_, _, g := regionStats(im, c.baseQuad(z))
		for i := range g {
			g[i] = math.Round(g[i]*10) / 10
		}
		c.BG[z] = g
	}
}
