import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AureliusDatabase, DexieProjectRepository, ProjectService } from "@aurelius/media";
import type { AppRuntime } from "./runtime";
import { ProjectDashboard } from "./components/ProjectDashboard";

let database: AureliusDatabase | undefined;

function dashboardRuntime(): AppRuntime {
  database = new AureliusDatabase(`editor-dashboard-${crypto.randomUUID()}`);
  const repository = new DexieProjectRepository(database);
  let sequence = 0;
  return {
    projectService: new ProjectService(repository, () => "2026-09-12T00:00:00.000Z", () => `test-${++sequence}`),
  } as unknown as AppRuntime;
}

afterEach(async () => {
  database?.close();
  await database?.delete();
  database = undefined;
});

describe("ProjectDashboard", () => {
  it("creates, renames, duplicates, opens, and deletes isolated local projects", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<ProjectDashboard runtime={dashboardRuntime()} onOpen={onOpen} />);

    const name = screen.getByLabelText("Project name");
    for (const title of ["First film", "Second film", "Third film", "Fourth film", "Fifth film"]) {
      await user.clear(name);
      await user.type(name, title);
      await user.click(screen.getByRole("button", { name: "Create project" }));
    }
    await waitFor(() => expect(screen.getAllByTestId("project-card")).toHaveLength(5));

    const firstCard = screen.getAllByTestId("project-card")[0]!;
    await user.click(within(firstCard).getByRole("button", { name: "Rename" }));
    const renameInput = within(firstCard).getByLabelText("Project name");
    await user.clear(renameInput);
    await user.type(renameInput, "Renamed film");
    await user.click(within(firstCard).getByRole("button", { name: "Save" }));
    await screen.findByText("Renamed film");

    await user.click(within(firstCard).getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(screen.getAllByTestId("project-card")).toHaveLength(6));
    await user.click(screen.getByRole("button", { name: "Open Renamed film" }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    await user.click(within(firstCard).getByRole("button", { name: "Delete" }));
    await user.click(within(firstCard).getByRole("button", { name: "Delete project" }));
    await waitFor(() => expect(screen.getAllByTestId("project-card")).toHaveLength(5));
    expect(screen.queryByRole("button", { name: "Open Renamed film" })).not.toBeInTheDocument();
  });
});
