package sql

import (
	"embed"
	"fmt"
)

//go:embed *.sql
var files embed.FS

func Must(name string) string {
	b, err := files.ReadFile(name)
	if err != nil {
		panic(fmt.Sprintf("sql: read %s: %v", name, err))
	}
	return string(b)
}
