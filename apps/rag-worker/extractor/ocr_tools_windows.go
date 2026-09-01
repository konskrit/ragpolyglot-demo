//go:build !unix

package extractor

import "os/exec"

func configureKillGroup(cmd *exec.Cmd) {}
