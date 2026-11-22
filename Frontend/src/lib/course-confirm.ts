// One consistent, accessible confirmation dialog for course actions.
export function confirmCourseAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "course-confirm-dialog";
    const heading = document.createElement("h2");
    heading.id = "course-confirm-title";
    const action = /^Delete/i.test(message)
      ? "Delete"
      : /^Publish/i.test(message)
        ? "Publish"
        : /^Replace/i.test(message)
          ? "Replace"
          : "Continue";
    heading.textContent =
      action === "Delete"
        ? "Confirm deletion"
        : action === "Publish"
          ? "Confirm publication"
          : "Confirm action";
    dialog.setAttribute("aria-labelledby", heading.id);
    const text = document.createElement("p");
    text.textContent = message;
    const actions = document.createElement("div");
    actions.className = "course-dialog-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "course-confirm-cancel";
    cancel.textContent = "Cancel";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className =
      action === "Delete" ? "course-confirm-delete" : "course-confirm-primary";
    confirm.textContent = action;
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener("click", () => finish(false));
    confirm.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("close", () => finish(false));
    actions.append(cancel, confirm);
    dialog.append(heading, text, actions);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
