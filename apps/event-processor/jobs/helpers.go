package jobs

import (
	"strconv"
	"strings"
)

func intFromPayload(payload map[string]any, key string) (int, bool) {
	if payload == nil {
		return 0, false
	}
	raw, ok := payload[key]
	if !ok {
		return 0, false
	}
	switch v := raw.(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	case string:
		n, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return n, true
	default:
		return 0, false
	}
}

func infoInt(info, key string) (int64, bool) {
	prefix := key + ":"
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, prefix) {
			continue
		}
		n, err := strconv.ParseInt(strings.TrimPrefix(line, prefix), 10, 64)
		if err != nil {
			return 0, false
		}
		return n, true
	}
	return 0, false
}
