export const studentResourceAccept = ".pdf,.doc,.docx";

export function validateResourceFile(
  file: File,
  role: "student" | "instructor",
) {
  if (role === "student" && !/\.(pdf|docx?)$/i.test(file.name)) {
    throw new Error("Choose a PDF or Word (.doc, .docx) file.");
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw new Error("Choose a nonempty file up to 10 MB.");
  }
}
