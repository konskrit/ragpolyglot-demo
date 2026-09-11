package api

import "testing"

func TestNormalizeDocumentIDs(t *testing.T) {
	ids, err := normalizeDocumentIDs([]string{
		"  A0Eebc99-9C0B-4EF8-BB6D-6BB9BD380A11 ",
		"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
		"",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" {
		t.Fatalf("got %#v", ids)
	}

	empty, err := normalizeDocumentIDs(nil)
	if err != nil || empty != nil {
		t.Fatalf("empty: %#v %v", empty, err)
	}

	if _, err := normalizeDocumentIDs([]string{"not-a-uuid"}); err == nil {
		t.Fatal("expected error")
	}
}
