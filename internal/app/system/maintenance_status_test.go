package system

import (
	"bufio"
	"strings"
	"testing"
)

func TestMaintenanceOperationPublishesProgress(t *testing.T) {
	store := NewMaintenanceOperationStore()
	operation := store.Start("update", []string{"update"}, "Preparing update")
	updates, unsubscribe := store.Subscribe()
	defer unsubscribe()

	initial := <-updates
	if initial.Progress == nil || *initial.Progress != 0 {
		t.Fatalf("initial progress = %v, want 0", initial.Progress)
	}

	store.AppendOutput(operation.ID, "35 28.6M 10.2M 0 11.2M 0:00:02 --:--:-- 0:00:02 11.2M")
	download := <-updates
	if download.Progress == nil || *download.Progress != 36 {
		t.Fatalf("download progress = %v, want 36", download.Progress)
	}

	store.AppendOutput(operation.ID, "Installing update")
	installing := <-updates
	if installing.Progress == nil || *installing.Progress != 88 {
		t.Fatalf("installing progress = %v, want 88", installing.Progress)
	}

	store.MarkRestarting(operation.ID, "Restarting")
	restarting := <-updates
	if restarting.Progress == nil || *restarting.Progress != 100 || restarting.Phase != "restarting" {
		t.Fatalf("restart snapshot = %+v, want restarting at 100%%", restarting)
	}
}

func TestSplitMaintenanceOutputSeparatesCarriageReturns(t *testing.T) {
	scanner := bufio.NewScanner(strings.NewReader("0%\r35%\r100%\n"))
	scanner.Split(splitMaintenanceOutput)

	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	if got, want := strings.Join(lines, ","), "0%,35%,100%"; got != want {
		t.Fatalf("split output = %q, want %q", got, want)
	}
}
