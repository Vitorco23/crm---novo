import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MissionThemeProvider } from "@/components/ui/mission-theme";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

afterEach(cleanup);

describe("mission theme across portals", () => {
  it.each([true, false])("themes dialog only when enabled: %s", (enabled) => {
    const { container } = render(
      <MissionThemeProvider value={enabled}>
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogTitle>Detalhes do lead</DialogTitle>
          </DialogContent>
        </Dialog>
      </MissionThemeProvider>,
    );
    const dialog = screen.getByRole("dialog");
    expect(container).not.toContainElement(dialog);
    expect(dialog.classList.contains("mission-theme")).toBe(enabled);
  });

  it("carries theme into a nested portal", () => {
    render(
      <>
        <MissionThemeProvider value={true}>
          <Dialog open>
            <DialogContent aria-describedby={undefined}>
              <DialogTitle>Editar lead</DialogTitle>
              <Popover open>
                <PopoverTrigger>Escolher nicho</PopoverTrigger>
                <PopoverContent data-testid="nested-menu">Serviços</PopoverContent>
              </Popover>
            </DialogContent>
          </Dialog>
        </MissionThemeProvider>
      </>,
    );
    expect(screen.getByTestId("nested-menu")).toHaveClass("mission-theme");
  });
});
