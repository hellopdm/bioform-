/**
 * BIOFORM AI - Application Bootstrap & Global Hotkeys
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("BIOFORM AI - Initializing Biomaterial Research Suite v2.5...");

  if (window.UI) {
    window.UI.init();
  }

  // 숫자 단축키 [1~0] 탭 즉시 전환
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    const tabMap = {
      "1": "dashboard",
      "2": "biomaterial_database",
      "3": "material_interaction",
      "4": "formulation_designer",
      "5": "property_simulation",
      "6": "inverse_design",
      "7": "multi_objective_opt",
      "8": "explainable_ai",
      "9": "experimental_design",
      "0": "research_report"
    };

    if (tabMap[e.key]) {
      UI.switchTab(tabMap[e.key]);
    }

    // Escape 키로 열려있는 모달 닫기
    if (e.key === "Escape") {
      document.getElementById("modal-new-project")?.classList.add("hidden");
      document.getElementById("modal-mat-detail")?.classList.add("hidden");
    }
  });

  console.log("BIOFORM AI - Platform ready. Scientific pipeline connected.");
});
