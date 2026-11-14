//go:build !windows

package main

// Developer commands on Linux/macOS: build the card database, run the synthetic test,
// scan a saved screenshot with a saved calibration.

import (
	"fmt"
	"os"
	"strconv"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("usage: mdscan build-db <cardinfo.json> <imgdir> <out> | selftest <db> <imgdir> [n] | scan <db> <calib.json> <screenshot.png>")
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "build-db":
		err = buildDB(os.Args[2], os.Args[3], os.Args[4])
	case "selftest":
		n := 30
		if len(os.Args) > 4 {
			n, _ = strconv.Atoi(os.Args[4])
		}
		err = selftest(os.Args[2], os.Args[3], n)
	case "scan":
		err = scanFileCmd(os.Args[2], os.Args[3], os.Args[4])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func scanFileCmd(dbPath, calibPath, shot string) error {
	raw, err := os.ReadFile(dbPath)
	if err != nil {
		return err
	}
	db, err := DecodeDB(raw)
	if err != nil {
		return err
	}
	m, err := loadCalib(calibPath)
	if err != nil {
		return err
	}
	im, err := loadImage(shot)
	if err != nil {
		return err
	}
	c := m[resKey(im.W, im.H)]
	if c == nil {
		return fmt.Errorf("no calibration for %dx%d", im.W, im.H)
	}
	b := toBoard(c.ScanField(db, im))
	fmt.Print(b.Summary())
	fmt.Println(b.Text())
	return nil
}
