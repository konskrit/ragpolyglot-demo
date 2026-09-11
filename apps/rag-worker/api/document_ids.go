package api

import (
	"fmt"
	"strings"
)

// normalizeDocumentIDs trims, lowercases, dedupes. Empty/nil → nil (search all).
// Invalid UUID → error.
func normalizeDocumentIDs(ids []string) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	out := make([]string, 0, len(ids))
	seen := make(map[string]struct{}, len(ids))
	for _, raw := range ids {
		id := strings.ToLower(strings.TrimSpace(raw))
		if id == "" {
			continue
		}
		if !isUUID(id) {
			return nil, fmt.Errorf("invalid documentId")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
				return false
			}
		}
	}
	return true
}
