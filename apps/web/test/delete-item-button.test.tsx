import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DeleteItemButton } from "@/features/reader/components/DeleteItemButton";

const deleteButton = () => screen.getByRole("button", { name: /^delete$/i });
const confirmButton = () =>
  screen.getByRole("button", { name: /delete for good/i });

describe("DeleteItemButton", () => {
  test("does not delete on the first click", () => {
    const onDelete = vi.fn().mockResolvedValue({ deleted: true });
    render(<DeleteItemButton onDelete={onDelete} />);

    fireEvent.click(deleteButton());

    expect(onDelete).not.toHaveBeenCalled();
    expect(confirmButton()).toBeInTheDocument();
  });

  test("deletes on the second click", async () => {
    const onDelete = vi.fn().mockResolvedValue({ deleted: true });
    render(<DeleteItemButton onDelete={onDelete} />);

    fireEvent.click(deleteButton());
    fireEvent.click(confirmButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  test("cancel disarms without deleting", () => {
    const onDelete = vi.fn().mockResolvedValue({ deleted: true });
    render(<DeleteItemButton onDelete={onDelete} />);

    fireEvent.click(deleteButton());
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /delete for good/i }),
    ).not.toBeInTheDocument();
    expect(deleteButton()).toBeInTheDocument();
  });

  test("stays armed when the delete fails, so the next click retries", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("nope"));
    render(<DeleteItemButton onDelete={onDelete} />);

    fireEvent.click(deleteButton());
    fireEvent.click(confirmButton());

    const retry = await screen.findByRole("button", { name: /failed/i });
    fireEvent.click(retry);

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
  });

  test("cannot be armed while a delete is in flight", () => {
    const onDelete = vi.fn().mockResolvedValue({ deleted: true });
    render(<DeleteItemButton disabled onDelete={onDelete} />);

    fireEvent.click(deleteButton());

    expect(
      screen.queryByRole("button", { name: /delete for good/i }),
    ).not.toBeInTheDocument();
  });
});
