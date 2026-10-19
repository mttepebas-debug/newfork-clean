import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lineupArtByKey, type Avatar } from "@newfork/shared";
import { AvatarPicker } from "./AvatarPicker";
import { uploadAvatarPhoto } from "./avatar-data";
import { RequestError } from "../lib/request-error";
import { stubPhoneWidth } from "../lib/phone-width.test-util";

vi.mock("../lineup-art/useLineupArt", () => ({
  useLineupArtSvgs: () => null,
  loadLineupArtSvgs: async () => ({}),
}));
vi.mock("../account/avatar-crop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../account/avatar-crop")>()),
  cropAvatar: vi.fn(async () => new File(["cropped"], "profile.png", { type: "image/png" })),
}));
vi.mock("./avatar-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./avatar-data")>()),
  uploadAvatarPhoto: vi.fn(async () => "ws/member/photo.png"),
}));

const workspaceId = "51000000-0000-4000-8000-000000000001";
const name = (key: string) => lineupArtByKey.get(key)!.name;
const note = "Only in Meyhouse. Other workspaces keep their own.";

function open(
  over: Partial<{
    initial: Avatar | null;
    suggested: string[];
    onSave: (choice: unknown) => Promise<void>;
    onRemove: () => Promise<void>;
    onClose: () => void;
  }> = {},
) {
  const props = {
    initial: null,
    suggested: ["001-server", "003-bartender"],
    onSave: vi.fn(async () => undefined),
    onClose: vi.fn(),
    ...over,
  };
  render(
    <AvatarPicker
      open
      workspaceId={workspaceId}
      workspaceName="Meyhouse"
      personName="Ayse Kaya"
      initial={props.initial}
      suggested={props.suggested}
      onSave={props.onSave}
      onRemove={over.onRemove}
      onClose={props.onClose}
    />,
  );
  return { ...props, dialog: screen.getByRole("dialog", { name: "Your avatar" }) };
}

function choosePhoto(file = new File(["photo"], "photo.png", { type: "image/png" })) {
  fireEvent.change(screen.getByLabelText("Choose a photo"), { target: { files: [file] } });
}

function cropIt() {
  const crop = screen.getByRole("dialog", { name: "Crop profile photo" });
  const image = within(crop).getByRole("img", { name: "Square photo preview" }).querySelector("img")!;
  Object.defineProperty(image, "naturalWidth", { value: 800 });
  Object.defineProperty(image, "naturalHeight", { value: 400 });
  fireEvent.load(image);
  fireEvent.click(within(crop).getByRole("button", { name: "Use photo" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvatarPicker (AVATAR-IKON, window B)", () => {
  it("opens on Suggested with the preview, Upload photo first and nothing to save yet", () => {
    const { dialog } = open();
    expect(within(dialog).getByRole("button", { name: "Suggested" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(dialog).getByText("Ayse Kaya")).toBeTruthy();
    expect(within(dialog).getByText("No avatar yet")).toBeTruthy();
    expect(within(dialog).getByText(note)).toBeTruthy();
    const tiles = within(dialog).getByRole("radiogroup");
    expect(tiles.firstElementChild?.textContent).toBe("Upload photo");
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(within(dialog).queryByRole("button", { name: "Remove avatar" })).toBeNull();
    expect(within(dialog).queryByText(/sample photo/i)).toBeNull();
    expect(dialog.classList.contains("avatar-picker--sheet")).toBe(false);
  });

  it("saves a drawing by its key and closes", async () => {
    const { dialog, onSave, onClose } = open();
    fireEvent.click(within(dialog).getByRole("radio", { name: name("003-bartender") }));
    expect(within(dialog).getByText(name("003-bartender"), { selector: ".avatar-picker-chosen" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ art_key: "003-bartender" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("uploads the cropped photo on Save and saves it by its path", async () => {
    const { dialog, onSave } = open();
    choosePhoto();
    cropIt();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crop profile photo" })).toBeNull());
    expect(within(dialog).getByText("Your photo")).toBeTruthy();
    expect(uploadAvatarPhoto).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ photo_path: "ws/member/photo.png" }));
    expect(uploadAvatarPhoto).toHaveBeenCalledWith(workspaceId, expect.any(File));
  });

  it("refuses an unsupported file before the crop window and storage", () => {
    const { dialog } = open();
    choosePhoto(new File(["svg"], "photo.svg", { type: "image/svg+xml" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/JPG, PNG or WebP/);
    expect(screen.queryByRole("dialog", { name: "Crop profile photo" })).toBeNull();
    expect(uploadAvatarPhoto).not.toHaveBeenCalled();
  });

  it("says in the window when the photo cannot be used or photos are down, and stays open", async () => {
    const onSave = vi.fn(async () => {
      throw new RequestError("bad", "avatar.photo_invalid", undefined, 400);
    });
    const { dialog, onClose } = open({ onSave });
    choosePhoto();
    cropIt();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crop profile photo" })).toBeNull());
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      "This photo couldn't be used. Try a JPG, PNG or WebP under 5 MB.",
    );
    vi.mocked(uploadAvatarPhoto).mockRejectedValueOnce(new RequestError("down", undefined, undefined, 503));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toBe("Photos are unavailable right now. Try again in a moment."),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the avatar on the second click only", async () => {
    const onRemove = vi.fn(async () => undefined);
    const { dialog, onClose } = open({ initial: { kind: "art", art_key: "001-server" }, onRemove });
    expect(within(dialog).getByRole("radio", { name: name("001-server") }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove avatar" }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm remove" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledOnce());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Cancel closes without saving", () => {
    const { dialog, onSave, onClose } = open();
    fireEvent.click(within(dialog).getByRole("radio", { name: name("001-server") }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("on a phone opens from the bottom", () => {
    stubPhoneWidth();
    const { dialog } = open();
    expect(dialog.classList.contains("avatar-picker--sheet")).toBe(true);
  });
});
