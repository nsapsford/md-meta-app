//go:build windows

package main

// MD Board Scanner for Windows. Runs in a console window beside Master Duel:
//   F7  set up (once per screen size)
//   F8  scan their whole field and copy it for the line finder
//   F9  add the card shown in Master Duel's card detail panel
//   F10 clear the cards added with F9
// Everything runs on this PC; nothing is sent anywhere.

import (
	_ "embed"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
	"unsafe"

	"github.com/atotto/clipboard"
	"github.com/kbinani/screenshot"
	"golang.org/x/sys/windows"
)

//go:embed cards.db
var cardsDB []byte

var (
	user32            = windows.NewLazySystemDLL("user32.dll")
	pRegisterHotKey   = user32.NewProc("RegisterHotKey")
	pGetMessage       = user32.NewProc("GetMessageW")
	pGetCursorPos     = user32.NewProc("GetCursorPos")
	pMessageBeep      = user32.NewProc("MessageBeep")
	pSetDpiCtx        = user32.NewProc("SetProcessDpiAwarenessContext")
	pSetDPIAware      = user32.NewProc("SetProcessDPIAware")
	kernel32          = windows.NewLazySystemDLL("kernel32.dll")
	pSetConsoleTitleW = kernel32.NewProc("SetConsoleTitleW")
)

const (
	vkF7, vkF8, vkF9, vkF10 = 0x76, 0x77, 0x78, 0x79
	modNoRepeat             = 0x4000
	wmHotkey                = 0x0312
)

type point struct{ X, Y int32 }
type msg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

func cursor() Pt {
	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	return Pt{float64(p.X), float64(p.Y)}
}

func beep(ok bool) {
	if ok {
		pMessageBeep.Call(0x40) // MB_ICONASTERISK
	} else {
		pMessageBeep.Call(0x10) // MB_ICONHAND
	}
}

// The monitor a screen point is on.
func displayAt(p Pt) image.Rectangle {
	n := screenshot.NumActiveDisplays()
	for i := 0; i < n; i++ {
		b := screenshot.GetDisplayBounds(i)
		if image.Pt(int(p.X), int(p.Y)).In(b) {
			return b
		}
	}
	return screenshot.GetDisplayBounds(0)
}

func capture(r image.Rectangle) (*Img, error) {
	rgba, err := screenshot.CaptureRect(r)
	if err != nil {
		return nil, err
	}
	im := &Img{W: r.Dx(), H: r.Dy(), Pix: make([]uint8, r.Dx()*r.Dy()*3)}
	for i, j := 0, 0; i < len(rgba.Pix); i, j = i+4, j+3 {
		im.Pix[j], im.Pix[j+1], im.Pix[j+2] = rgba.Pix[i], rgba.Pix[i+1], rgba.Pix[i+2]
	}
	return im, nil
}

type app struct {
	db        *DB
	calPath   string
	cals      map[string]*Calib
	cal       *Calib
	rect      image.Rectangle
	field     []Found
	added     []Found
	setupStep int // 0 = not setting up
	draft     *Calib
}

const finderURL = "https://claude.ai/artifact/4aaPVKK4r7tTCeSTYHbsL6"

var steps = []string{
	"Hover over the CENTRE of THEIR LEFTMOST MONSTER ZONE (their row nearer you), then press F8.",
	"Now the centre of THEIR RIGHTMOST MONSTER ZONE, then F8.",
	"Now the centre of THEIR LEFTMOST SPELL/TRAP ZONE (their far row), then F8.",
	"Now the centre of THEIR RIGHTMOST SPELL/TRAP ZONE, then F8.",
	"Optional, for F9: click any card so the card detail panel shows its picture. Hover the TOP-LEFT corner of that picture and press F8 (or F10 to skip).",
	"Now the BOTTOM-RIGHT corner of that picture, then F8.",
	"Last: with THEIR FIELD EMPTY (start of the duel is best), press F8 to record what an empty field looks like. F10 skips this, but empty zones are then judged less reliably.",
}

func (a *app) say(format string, args ...any) { fmt.Printf(format+"\n", args...) }

func (a *app) startSetup() {
	a.setupStep = 1
	a.draft = &Calib{}
	a.say("\n── Set-up ──  (F7 again to restart)")
	a.say("Open a duel with the field visible.")
	a.say("1/7 %s", steps[0])
}

func (a *app) setupKey(key int) {
	s := a.setupStep
	d := a.draft
	if key == vkF10 && s >= 5 {
		if s <= 6 {
			d.PanelTL, d.PanelBR = nil, nil
			a.setupStep = 7
			a.say("7/7 %s", steps[6])
			return
		}
		a.finishSetup(nil)
		return
	}
	if key != vkF8 {
		return
	}
	p := cursor()
	if s == 1 {
		a.rect = displayAt(p)
		d.OX, d.OY, d.ScreenW, d.ScreenH = a.rect.Min.X, a.rect.Min.Y, a.rect.Dx(), a.rect.Dy()
	}
	rel := Pt{p.X - float64(d.OX), p.Y - float64(d.OY)}
	switch s {
	case 1:
		d.M1 = rel
	case 2:
		d.M5 = rel
	case 3:
		d.S1 = rel
	case 4:
		d.S5 = rel
	case 5:
		d.PanelTL = &rel
	case 6:
		d.PanelBR = &rel
	case 7:
		im, err := capture(a.rect)
		if err != nil {
			a.say("Couldn't capture the screen: %v", err)
			return
		}
		a.finishSetup(im)
		return
	}
	beep(true)
	a.setupStep++
	a.say("%d/7 %s", a.setupStep, steps[a.setupStep-1])
}

func (a *app) finishSetup(empty *Img) {
	d := a.draft
	if norm(sub(d.M5, d.M1)) < 40 || norm(sub(d.S5, d.S1)) < 40 {
		a.say("Those points are too close together. Press F7 to set up again.")
		a.setupStep = 0
		beep(false)
		return
	}
	if empty != nil {
		d.captureBackground(empty)
	}
	a.cals[resKey(d.ScreenW, d.ScreenH)] = d
	a.cal = d
	a.setupStep = 0
	if err := saveCalib(a.calPath, a.cals); err != nil {
		a.say("Set-up done, but it couldn't be saved (%v). It will last until you close this window.", err)
	} else {
		a.say("Set-up saved for %dx%d.", d.ScreenW, d.ScreenH)
	}
	beep(true)
	a.ready()
}

func (a *app) ready() {
	a.say("\nReady. F8 scans their field. F9 adds the card in the detail panel. F10 clears F9 cards. F7 sets up again.")
}

func (a *app) publish() {
	all := append(append([]Found(nil), a.field...), a.added...)
	b := toBoard(all)
	a.say("\nTheir field:")
	fmt.Print(b.Summary())
	if err := clipboard.WriteAll(b.Text()); err != nil {
		a.say("Couldn't copy to the clipboard: %v", err)
		beep(false)
		return
	}
	a.say("Copied. In the line finder (%s) press Ctrl+V anywhere on the page.", finderURL)
	beep(true)
}

func (a *app) grab() (*Img, bool) {
	if a.cal == nil {
		a.say("Not set up for this screen yet. Press F7.")
		beep(false)
		return nil, false
	}
	r := image.Rect(a.cal.OX, a.cal.OY, a.cal.OX+a.cal.ScreenW, a.cal.OY+a.cal.ScreenH)
	b := displayAt(Pt{float64(a.cal.OX + 1), float64(a.cal.OY + 1)})
	if b != r {
		a.say("The screen layout changed since set-up (%dx%d now). Press F7 to set up again.", b.Dx(), b.Dy())
		beep(false)
		return nil, false
	}
	im, err := capture(r)
	if err != nil {
		a.say("Couldn't capture the screen: %v", err)
		beep(false)
		return nil, false
	}
	if blank(im) {
		a.say("The capture came back black. Set Master Duel to windowed or borderless full screen and try again.")
		beep(false)
		return nil, false
	}
	return im, true
}

func blank(im *Img) bool {
	var s int
	for i := 0; i < len(im.Pix); i += 997 {
		s += int(im.Pix[i])
	}
	return s < len(im.Pix)/997*3
}

func (a *app) key(k int) {
	if k == vkF7 {
		a.startSetup()
		return
	}
	if a.setupStep > 0 {
		a.setupKey(k)
		return
	}
	switch k {
	case vkF8:
		im, ok := a.grab()
		if !ok {
			return
		}
		t0 := time.Now()
		a.field = a.cal.ScanField(a.db, im)
		a.say("\n(scanned in %d ms)", time.Since(t0).Milliseconds())
		a.publish()
	case vkF9:
		if a.cal != nil && a.cal.PanelTL == nil {
			a.say("F9 needs the detail panel marked. Press F7 and do the optional steps.")
			beep(false)
			return
		}
		im, ok := a.grab()
		if !ok {
			return
		}
		f := a.cal.ScanPanel(a.db, im)
		if !confident(f) {
			guess := ""
			if f.Card != nil {
				guess = " (best guess: " + f.Card.Name + ")"
			}
			a.say("\nCouldn't tell which card that is%s. Open its details and press F9 again.", guess)
			beep(false)
			return
		}
		a.added = append(a.added, f)
		a.say("\nAdded %s.", f.Card.Name)
		a.publish()
	case vkF10:
		a.added = nil
		a.say("\nCleared the cards added with F9.")
		a.publish()
	}
}

func main() {
	if r, _, _ := pSetDpiCtx.Call(uintptr(^uintptr(3))); r == 0 { // PER_MONITOR_AWARE_V2
		pSetDPIAware.Call()
	}
	title, _ := windows.UTF16PtrFromString("MD Board Scanner")
	pSetConsoleTitleW.Call(uintptr(unsafe.Pointer(title)))
	fmt.Println("MD Board Scanner  -  reads their Master Duel field for the DM Azamina Line Finder. Runs offline.")
	db, err := DecodeDB(cardsDB)
	if err != nil {
		fmt.Println("The card database is damaged:", err)
		fmt.Scanln()
		return
	}
	exe, _ := os.Executable()
	a := &app{db: db, calPath: filepath.Join(filepath.Dir(exe), "mdscan-setup.json")}
	if a.cals, err = loadCalib(a.calPath); err != nil {
		a.cals = map[string]*Calib{}
	}
	fmt.Printf("%d cards known.\n", len(db.Cards))

	runtime.LockOSThread()
	keys := []int{vkF7, vkF8, vkF9, vkF10}
	var failed []string
	for _, k := range keys {
		if r, _, _ := pRegisterHotKey.Call(0, uintptr(k), modNoRepeat, uintptr(k)); r == 0 {
			failed = append(failed, fmt.Sprintf("F%d", k-0x6F))
		}
	}
	if len(failed) > 0 {
		fmt.Printf("Another program is using %s, so those keys won't work here. Close it and restart this.\n", strings.Join(failed, ", "))
	}
	// Pick the set-up for the screen the cursor is on.
	b := displayAt(cursor())
	a.rect = b
	if c := a.cals[resKey(b.Dx(), b.Dy())]; c != nil && c.OX == b.Min.X && c.OY == b.Min.Y {
		a.cal = c
		fmt.Printf("Using the saved set-up for %dx%d.\n", b.Dx(), b.Dy())
		a.ready()
	} else if len(a.cals) > 0 {
		for _, c := range a.cals {
			a.cal = c
			break
		}
		fmt.Println("Using a saved set-up. If scans come out wrong, press F7.")
		a.ready()
	} else {
		fmt.Println("First run: press F7 in a duel to set up (about 20 seconds).")
	}
	var m msg
	for {
		r, _, _ := pGetMessage.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if int32(r) <= 0 {
			return
		}
		if m.Message == wmHotkey {
			a.key(int(m.WParam))
		}
	}
}
