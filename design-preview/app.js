const concepts = [
  { title: "Quiet Capital", image: "assets/concept-01.png" },
  { title: "Market Terminal", image: "assets/concept-02.png" },
  { title: "Blue Prism", image: "assets/concept-03.png" },
  { title: "Kinetic Ledger", image: "assets/concept-04.png" },
  { title: "Index Infrastructure", image: "assets/concept-05.png" },
  { title: "Signal Capsule", image: "assets/concept-06.png" },
  { title: "Portfolio Workspace", image: "assets/concept-07.png" },
  { title: "Market Layers", image: "assets/concept-08.png" },
];

const dialog = document.querySelector(".preview");
const image = document.querySelector("#preview-image");
const number = document.querySelector("#preview-number");
const title = document.querySelector("#preview-title");
let activeIndex = 0;

function showConcept(index) {
  activeIndex = (index + concepts.length) % concepts.length;
  const concept = concepts[activeIndex];
  number.textContent = String(activeIndex + 1).padStart(2, "0");
  title.textContent = concept.title;
  image.src = concept.image;
  image.alt = `${concept.title} full-screen MAG7 frontend direction`;
  document.querySelector(".preview-stage").scrollTo({ top: 0, left: 0 });
  window.history.replaceState(null, "", `#concept-${activeIndex + 1}`);
}

function openConcept(index) {
  showConcept(index);
  dialog.showModal();
  document.body.style.overflow = "hidden";
}

function closePreview() {
  dialog.close();
  document.body.style.overflow = "";
  window.history.replaceState(null, "", window.location.pathname);
}

document.querySelectorAll("[data-preview]").forEach((button) => {
  button.addEventListener("click", () => {
    openConcept(Number(button.dataset.preview) - 1);
  });
});

document.querySelector("#previous").addEventListener("click", () => showConcept(activeIndex - 1));
document.querySelector("#next").addEventListener("click", () => showConcept(activeIndex + 1));
document.querySelector("#close").addEventListener("click", closePreview);

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closePreview();
});

dialog.addEventListener("close", () => {
  document.body.style.overflow = "";
});

document.addEventListener("keydown", (event) => {
  if (!dialog.open) return;
  if (event.key === "ArrowLeft") showConcept(activeIndex - 1);
  if (event.key === "ArrowRight") showConcept(activeIndex + 1);
});

const requestedConcept = Number(window.location.hash.replace("#concept-", ""));
if (requestedConcept >= 1 && requestedConcept <= concepts.length) {
  openConcept(requestedConcept - 1);
}
