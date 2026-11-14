package main

// "mdscan build-db <cardinfo.json> <image dir> <out>": fingerprints every card image once.
// The output is embedded in the program, so scanning needs no internet.

import (
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

func loadImage(path string) (*Img, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	src, _, err := image.Decode(f)
	if err != nil {
		return nil, err
	}
	return fromImage(src), nil
}

func fromImage(src image.Image) *Img {
	b := src.Bounds()
	rgba := image.NewRGBA(image.Rect(0, 0, b.Dx(), b.Dy()))
	draw.Draw(rgba, rgba.Bounds(), src, b.Min, draw.Src)
	im := &Img{W: b.Dx(), H: b.Dy(), Pix: make([]uint8, b.Dx()*b.Dy()*3)}
	for i, j := 0, 0; i < len(rgba.Pix); i, j = i+4, j+3 {
		im.Pix[j], im.Pix[j+1], im.Pix[j+2] = rgba.Pix[i], rgba.Pix[i+1], rgba.Pix[i+2]
	}
	return im
}

func kindOf(typ string) uint8 {
	switch {
	case strings.Contains(typ, "Link"):
		return 4
	case strings.Contains(typ, "XYZ"):
		return 3
	case strings.Contains(typ, "Synchro"):
		return 2
	case strings.Contains(typ, "Fusion"):
		return 1
	case strings.HasPrefix(typ, "Spell"):
		return 5
	case strings.HasPrefix(typ, "Trap"):
		return 6
	}
	return 0
}

func cardQuads(im *Img, kind uint8, pend bool) (art, full Quad) {
	w, h := float64(im.W), float64(im.H)
	full = Quad{{0, 0}, {w, 0}, {w, h}, {0, h}}
	u0, v0, u1, v1 := artBox(kind, pend)
	art = subQuad(full, u0, v0, u1, v1)
	return
}

func buildDB(jsonPath, imgDir, out string) error {
	raw, err := os.ReadFile(jsonPath)
	if err != nil {
		return err
	}
	var doc struct {
		Data []struct {
			ID        uint32 `json:"id"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			FrameType string `json:"frameType"`
			ATK       *int   `json:"atk"`
			DEF       *int   `json:"def"`
			Images    []struct {
				Small string `json:"image_url_small"`
			} `json:"card_images"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return err
	}
	type job struct {
		i    int
		path string
		pend bool
	}
	cards := make([]Card, 0, len(doc.Data))
	var jobs []job
	for _, c := range doc.Data {
		if c.Type == "Token" || c.Type == "Skill Card" || len(c.Images) == 0 {
			continue
		}
		p := filepath.Join(imgDir, filepath.Base(c.Images[0].Small))
		if _, err := os.Stat(p); err != nil {
			continue
		}
		cd := Card{ID: c.ID, Name: c.Name, Kind: kindOf(c.Type)}
		if c.ATK != nil {
			cd.ATK = int16(*c.ATK)
		}
		if c.DEF != nil {
			cd.DEF = int16(*c.DEF)
		}
		jobs = append(jobs, job{len(cards), p, strings.Contains(c.FrameType, "pendulum")})
		cards = append(cards, cd)
	}
	ok := make([]bool, len(cards))
	var wg sync.WaitGroup
	ch := make(chan job)
	for w := 0; w < runtime.NumCPU(); w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range ch {
				im, err := loadImage(j.path)
				if err != nil {
					continue
				}
				art, full := cardQuads(im, cards[j.i].Kind, j.pend)
				cards[j.i].Art = describeQuad(im, art)
				cards[j.i].Full = describeQuad(im, full)
				ok[j.i] = true
			}
		}()
	}
	for _, j := range jobs {
		ch <- j
	}
	close(ch)
	wg.Wait()
	db := &DB{}
	for i := range cards {
		if ok[i] {
			db.Cards = append(db.Cards, cards[i])
		}
	}
	if err := os.WriteFile(out, db.Encode(), 0o644); err != nil {
		return err
	}
	fmt.Printf("%d cards fingerprinted (%d listed)\n", len(db.Cards), len(doc.Data))
	return nil
}
