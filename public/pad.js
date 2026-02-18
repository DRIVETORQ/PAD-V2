const slug = decodeURIComponent(location.pathname.slice(1) || "home")
  .trim()
  .slice(0, 80) || "home";

const ta = document.getElementById("t");
const ioClient = io();

let applyingRemote = false;
let lastSent = "";
let timer = null;

ioClient.emit("join", slug);

ioClient.on("init", (text) => {
  applyingRemote = true;
  ta.value = String(text ?? "");
  lastSent = ta.value;
  applyingRemote = false;
});

ioClient.on("remote", (text) => {
  const newText = String(text ?? "");
  if (newText === ta.value) return;

  const start = ta.selectionStart;
  const end = ta.selectionEnd;

  applyingRemote = true;
  ta.value = newText;
  applyingRemote = false;

  try {
    ta.setSelectionRange(
      Math.min(start, newText.length),
      Math.min(end, newText.length)
    );
  } catch {}

  lastSent = ta.value;
});

function sendNow() {
  if (applyingRemote) return;
  const v = ta.value;
  if (v === lastSent) return;
  lastSent = v;
  ioClient.emit("edit", { slug, text: v });
}

ta.addEventListener("input", () => {
  if (applyingRemote) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    sendNow();
  }, 500);
});

ta.addEventListener("blur", () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  sendNow();
});