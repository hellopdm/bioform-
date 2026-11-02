/**
 * BIOFORM AI - User Interface & Interactive Platform Controller
 * 10대 한국어 연구 모듈, 프로젝트 상태 관리(LocalStorage),
 * 모든 버튼/입력창의 실제 기능 연결 및 엔드투엔드 데이터 파이프라인
 */

const UI = {
  activeTab: "dashboard",
  projects: [],
  activeProjectId: null,
  
  // 차트 인스턴스 보관소
  charts: {},

  init() {
    this.initProjectState();
    this.bindNavigation();
    this.bindModalEvents();
    this.switchTab(this.activeTab);
  },

  // --------------------------------------------------------------------------
  // 1. 프로젝트 상태 관리 (LocalStorage 및 파이프라인 무결성 보장)
  // --------------------------------------------------------------------------
  initProjectState() {
    try {
      const saved = localStorage.getItem("bioform_projects");
      if (saved) {
        this.projects = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("LocalStorage 접근 실패, 기본 데이터 사용");
    }

    if (!this.projects || this.projects.length === 0) {
      this.projects = JSON.parse(JSON.stringify(DEFAULT_PROJECTS));
      this.saveProjectsToStorage();
    }

    // 각 프로젝트에 누락된 파이프라인 필드 보강
    this.projects.forEach(p => this.ensureProjectPipelineData(p));

    const savedActiveId = localStorage.getItem("bioform_active_project_id");
    if (savedActiveId && this.projects.some(p => p.id === savedActiveId)) {
      this.activeProjectId = savedActiveId;
    } else {
      this.activeProjectId = this.projects[0].id;
    }
  },

  ensureProjectPipelineData(p) {
    if (!p.materials || p.materials.length === 0) {
      p.materials = [{ id: "alginate", ratio: 60 }, { id: "chitosan", ratio: 40 }];
    }
    if (!p.crosslinker) p.crosslinker = "ca";
    if (p.crosslinkerDensity === undefined) p.crosslinkerDensity = 2.0;
    if (p.phCondition === undefined) p.phCondition = 7.4;
    if (p.tempCondition === undefined) p.tempCondition = 37.0;
    if (p.drugLoading === undefined) p.drugLoading = 5.0;
    if (!p.stage) p.stage = 1;

    // 기본 시뮬레이션 결과 캐시가 없으면 계산
    if (!p.simulationResults) {
      const props = PhysicsEngine.calculateCompositeProperties(p.materials, p.crosslinker, p.crosslinkerDensity, { ph: p.phCondition, temp: p.tempCondition });
      const sim = PhysicsEngine.simulateDrugRelease(p.materials, p.crosslinker, p.crosslinkerDensity, { ph: p.phCondition, drugLoading: p.drugLoading });
      p.simulationResults = { props, sim };
    }

    // 기본 상호작용 분석
    if (!p.interactionAnalysis && p.materials.length >= 2) {
      p.interactionAnalysis = PhysicsEngine.analyzeMaterialInteraction(p.materials[0].id, p.materials[1].id, { ph: p.phCondition, temp: p.tempCondition });
    }

    // 기본 후속 실험 계획
    if (!p.experimentProtocol) {
      p.experimentProtocol = PhysicsEngine.generateDynamicExperimentProtocol(p);
    }
  },

  saveProjectsToStorage() {
    try {
      localStorage.setItem("bioform_projects", JSON.stringify(this.projects));
      localStorage.setItem("bioform_active_project_id", this.activeProjectId);
    } catch (e) {
      console.warn("저장 실패", e);
    }
  },

  getActiveProject() {
    let proj = this.projects.find(p => p.id === this.activeProjectId);
    if (!proj) {
      proj = this.projects[0];
      this.activeProjectId = proj.id;
    }
    this.ensureProjectPipelineData(proj);
    return proj;
  },

  setActiveProject(projId) {
    if (!this.projects.some(p => p.id === projId)) return;
    this.activeProjectId = projId;
    this.saveProjectsToStorage();
    const proj = this.getActiveProject();
    this.showToast(`활성 프로젝트가 '${proj.name}'(으)로 변경되었습니다.`);
    this.renderActiveTab();
    this.updateGlobalHeader();
  },

  // --------------------------------------------------------------------------
  // 2. 내비게이션 및 모달 바인딩
  // --------------------------------------------------------------------------
  bindNavigation() {
    document.querySelectorAll(".nav-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
      });
    });
  },

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll(".nav-tab-btn").forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add("bg-sky-500/20", "text-sky-400", "border-sky-500/40");
        btn.classList.remove("text-slate-400", "hover:text-slate-200");
      } else {
        btn.classList.remove("bg-sky-500/20", "text-sky-400", "border-sky-500/40");
        btn.classList.add("text-slate-400", "hover:text-slate-200");
      }
    });

    document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
    
    const targetPane = document.getElementById(`tab-${tabId}`);
    if (targetPane) {
      targetPane.classList.remove("hidden");
      this.renderTabContent(tabId);
    }
    this.updateGlobalHeader();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  bindModalEvents() {
    const modal = document.getElementById("modal-new-project");
    const openBtn = document.getElementById("btn-open-create-modal");
    const closeBtn = document.getElementById("btn-close-create-modal");
    const form = document.getElementById("form-create-project");

    if (openBtn && modal) {
      openBtn.addEventListener("click", () => modal.classList.remove("hidden"));
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    }
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleCreateProject(form);
        modal.classList.add("hidden");
      });
    }
  },

  handleCreateProject(form) {
    const name = form.projectName.value.trim() || "새 생체재료 설계 프로젝트";
    const purpose = form.projectPurpose.value.trim() || "약물 전달 및 조직공학용 복합재료 개발";
    const targetDrug = form.targetDrug.value.trim() || "모델 약물 (BSA/소염제)";
    const description = form.projectDescription.value.trim() || "AI 기반 복합 생체재료 물성 최적화 연구.";
    
    // 선택된 재료 체크박스 추출
    const selectedMats = [];
    form.querySelectorAll("input[name='materials']:checked").forEach(cb => selectedMats.push(cb.value));
    
    const baseMats = selectedMats.length > 0 ? selectedMats : ["alginate", "chitosan"];
    const ratioPerMat = Math.floor(100 / baseMats.length);
    const materials = baseMats.map((id, idx) => ({
      id,
      ratio: idx === baseMats.length - 1 ? 100 - (ratioPerMat * (baseMats.length - 1)) : ratioPerMat
    }));

    const newProject = {
      id: `proj_${Date.now()}`,
      name,
      purpose,
      targetDrug,
      drugLoading: 5.0,
      materials,
      crosslinker: "ca",
      crosslinkerDensity: 2.0,
      phCondition: 7.4,
      tempCondition: 37.0,
      status: "in_progress",
      stage: 1,
      createdAt: new Date().toISOString().split("T")[0],
      updatedAt: new Date().toISOString().split("T")[0],
      description
    };

    this.ensureProjectPipelineData(newProject);
    this.projects.unshift(newProject);
    this.activeProjectId = newProject.id;
    this.saveProjectsToStorage();
    form.reset();

    this.showToast(`새 프로젝트 '${name}'이(가) 등록되고 활성화되었습니다.`);
    this.renderActiveTab();
    this.updateGlobalHeader();
  },

  updateGlobalHeader() {
    const proj = this.getActiveProject();
    const nameEl = document.getElementById("header-active-proj-name");
    const drugEl = document.getElementById("header-active-drug");
    if (nameEl) nameEl.textContent = proj.name;
    if (drugEl) drugEl.textContent = `대상 약물: ${proj.targetDrug}`;
  },

  renderActiveTab() {
    this.renderTabContent(this.activeTab);
  },

  renderTabContent(tabId) {
    switch (tabId) {
      case "dashboard": this.renderDashboard(); break;
      case "biomaterial_database": this.renderBiomaterialDatabase(); break;
      case "material_interaction": this.renderMaterialInteraction(); break;
      case "formulation_designer": this.renderFormulationDesigner(); break;
      case "property_simulation": this.renderPropertySimulation(); break;
      case "inverse_design": this.renderInverseDesign(); break;
      case "multi_objective_opt": this.renderMultiObjectiveOpt(); break;
      case "explainable_ai": this.renderExplainableAI(); break;
      case "experimental_design": this.renderExperimentalDesign(); break;
      case "research_report": this.renderResearchReport(); break;
    }
  },

  // --------------------------------------------------------------------------
  // ① 연구 현황 및 설계 프로젝트 (Research Dashboard)
  // --------------------------------------------------------------------------
  renderDashboard() {
    const container = document.getElementById("tab-dashboard");
    if (!container) return;

    const totalProjects = this.projects.length;
    const inProgress = this.projects.filter(p => p.status === "in_progress").length;
    const completed = this.projects.filter(p => p.status === "completed").length;
    const totalMaterials = BIOMATERIALS_DB.length;

    const activeProj = this.getActiveProject();
    const props = activeProj.simulationResults?.props || PhysicsEngine.calculateCompositeProperties(activeProj.materials, activeProj.crosslinker, activeProj.crosslinkerDensity, { ph: activeProj.phCondition });
    const sim = activeProj.simulationResults?.sim || PhysicsEngine.simulateDrugRelease(activeProj.materials, activeProj.crosslinker, activeProj.crosslinkerDensity, { ph: activeProj.phCondition, drugLoading: activeProj.drugLoading });

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-2">
            BIOFORM AI Research Management Dashboard
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">연구 현황 및 설계 프로젝트</h2>
          <p class="text-slate-400 text-xs md:text-sm mt-1">
            등록된 생체재료 기반 복합 시스템의 전주기 연구 진행 현황과 최근 시뮬레이션 지표를 통합 관리합니다.
          </p>
        </div>
        <button onclick="document.getElementById('modal-new-project').classList.remove('hidden')"
                class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 transition-all flex items-center gap-2 self-start md:self-auto">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span>새 프로젝트 생성</span>
        </button>
      </div>

      <!-- 상단 4대 현황 카드 -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-xs text-slate-400 font-semibold uppercase">전체 연구 프로젝트</span>
          <div class="text-3xl font-black text-white mt-1.5 font-mono">${totalProjects} <span class="text-sm font-normal text-slate-400">건</span></div>
          <div class="text-[11px] text-slate-400 mt-1">플랫폼 내 누적 데이터셋</div>
        </div>
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-xs text-sky-400 font-semibold uppercase">진행 중인 프로젝트</span>
          <div class="text-3xl font-black text-sky-400 mt-1.5 font-mono">${inProgress} <span class="text-sm font-normal text-slate-400">건</span></div>
          <div class="text-[11px] text-slate-400 mt-1">시뮬레이션 및 최적화 진행</div>
        </div>
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-xs text-emerald-400 font-semibold uppercase">완료된 프로젝트</span>
          <div class="text-3xl font-black text-emerald-400 mt-1.5 font-mono">${completed} <span class="text-sm font-normal text-slate-400">건</span></div>
          <div class="text-[11px] text-slate-400 mt-1">후속 실험 검증 보고서 발행</div>
        </div>
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <span class="text-xs text-indigo-400 font-semibold uppercase">등록된 생체재료 DB</span>
          <div class="text-3xl font-black text-indigo-400 mt-1.5 font-mono">${totalMaterials} <span class="text-sm font-normal text-slate-400">종</span></div>
          <div class="text-[11px] text-slate-400 mt-1">다당류, 단백질, 합성, 세라믹</div>
        </div>
      </div>

      <!-- 활성 프로젝트 진행 파이프라인 단계 표시 -->
      <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 mb-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div>
            <span class="text-xs font-bold text-sky-400 uppercase tracking-wider">현재 활성 연구 프로젝트 단계</span>
            <h3 class="text-lg font-bold text-white mt-0.5">${activeProj.name}</h3>
          </div>
          <span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 self-start">
            단계 ${activeProj.stage} / 9 진행중
          </span>
        </div>

        <div class="grid grid-cols-3 md:grid-cols-9 gap-2 text-center text-xs">
          ${[
            { num: 1, title: "프로젝트 기획", tab: "dashboard" },
            { num: 2, title: "재료 DB 탐색", tab: "biomaterial_database" },
            { num: 3, title: "상호작용 분석", tab: "material_interaction" },
            { num: 4, title: "복합재료 설계", tab: "formulation_designer" },
            { num: 5, title: "물성 시뮬레이션", tab: "property_simulation" },
            { num: 6, title: "목표 역설계", tab: "inverse_design" },
            { num: 7, title: "다목적 최적화", tab: "multi_objective_opt" },
            { num: 8, title: "XAI 근거 분석", tab: "explainable_ai" },
            { num: 9, title: "보고서 발행", tab: "research_report" }
          ].map(s => `
            <div onclick="UI.switchTab('${s.tab}')" class="cursor-pointer p-2.5 rounded-xl border transition-all ${s.num <= activeProj.stage ? 'bg-sky-500/10 border-sky-500/30 text-white' : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:bg-slate-800'}">
              <div class="w-5 h-5 mx-auto mb-1 rounded-full text-[10px] font-bold flex items-center justify-center ${s.num <= activeProj.stage ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-400'}">${s.num}</div>
              <div class="text-[11px] font-medium truncate">${s.title}</div>
            </div>
          `).join("")}
        </div>
      </div>

      <!-- 최근 시뮬레이션 결과 요약 및 프로젝트 목록 그리드 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 최근 시뮬레이션 결과 요약 패널 -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
              최근 물성 및 방출 예측 결과
            </h3>
            <button onclick="UI.switchTab('property_simulation')" class="text-xs text-sky-400 hover:underline">상세보기 &rarr;</button>
          </div>

          <div class="grid grid-cols-2 gap-3 text-xs">
            <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
              <span class="text-slate-400 block text-[10px]">탄성계수 (E)</span>
              <span class="text-lg font-bold text-white">${props.elasticModulusKPa} <span class="text-xs text-slate-400">kPa</span></span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
              <span class="text-slate-400 block text-[10px]">인장강도 (UTS)</span>
              <span class="text-lg font-bold text-white">${props.tensileStrengthMPa} <span class="text-xs text-slate-400">MPa</span></span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
              <span class="text-slate-400 block text-[10px]">평형 팽윤율 (Q)</span>
              <span class="text-lg font-bold text-sky-400">${props.swellingRatioPercent}%</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
              <span class="text-slate-400 block text-[10px]">24h 누적 방출률</span>
              <span class="text-lg font-bold text-emerald-400">${sim.release24h}%</span>
            </div>
          </div>

          <div class="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800 text-xs space-y-1.5">
            <div class="flex justify-between text-slate-300">
              <span class="text-slate-400">생체적합성 지수:</span>
              <span class="font-bold text-indigo-400">${props.biocompatibilityScore} / 100</span>
            </div>
            <div class="flex justify-between text-slate-300">
              <span class="text-slate-400">약물 방출 기전:</span>
              <span class="font-bold text-sky-300">${sim.mechanismText.split('(')[0]}</span>
            </div>
            <div class="flex justify-between text-slate-300">
              <span class="text-slate-400">예상 생분해 기간:</span>
              <span class="font-bold text-slate-200">${props.biodegradationRateText}</span>
            </div>
          </div>

          <button onclick="UI.switchTab('formulation_designer')" class="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-bold transition-all text-center border border-slate-700">
            조성 파라미터 수정하기 &rarr;
          </button>
        </div>

        <!-- 최근 생성된 프로젝트 목록 (2컬럼) -->
        <div class="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <h3 class="text-base font-bold text-white">최근 연구 프로젝트 목록</h3>
            <span class="text-xs text-slate-400 font-mono">${this.projects.length}개 등록됨</span>
          </div>

          <div class="space-y-3">
            ${this.projects.map(p => {
              const isActive = p.id === this.activeProjectId;
              const matNames = p.materials.map(m => {
                const dbMat = BIOMATERIALS_DB.find(x => x.id === m.id);
                return `${dbMat ? dbMat.nameKo : m.id}(${m.ratio}%)`;
              }).join(", ");

              return `
                <div class="p-4 rounded-xl border transition-all ${isActive ? 'bg-sky-500/10 border-sky-500/40 shadow-md' : 'bg-slate-800/40 border-slate-800 hover:border-slate-700'}">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div class="flex items-center gap-2">
                      <span class="w-2.5 h-2.5 rounded-full ${isActive ? 'bg-sky-400' : 'bg-slate-500'}"></span>
                      <h4 class="font-bold text-sm text-white">${p.name}</h4>
                      ${isActive ? '<span class="px-2 py-0.5 rounded text-[10px] bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">활성 프로젝트</span>' : ''}
                    </div>
                    <span class="text-xs text-slate-400 font-mono">${p.updatedAt}</span>
                  </div>
                  <p class="text-xs text-slate-400 mb-2 leading-relaxed">${p.purpose}</p>
                  <div class="flex flex-wrap items-center justify-between gap-2 text-xs border-t border-slate-800/80 pt-2">
                    <span class="text-slate-400">구성: <strong class="text-slate-200">${matNames}</strong></span>
                    ${!isActive ? `
                      <button onclick="UI.setActiveProject('${p.id}')" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 font-semibold text-xs border border-slate-700 transition-all">
                        이 프로젝트 불러오기
                      </button>
                    ` : `
                      <span class="text-emerald-400 font-bold text-xs">현재 작업 중</span>
                    `}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  },

  // --------------------------------------------------------------------------
  // ② 생체재료 데이터베이스 (Biomaterial Database)
  // --------------------------------------------------------------------------
  renderBiomaterialDatabase() {
    const container = document.getElementById("tab-biomaterial_database");
    if (!container) return;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-2">
            Curated Biomaterial Intelligence Database (14 Species)
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">생체재료 데이터베이스</h2>
          <p class="text-slate-400 text-xs md:text-sm mt-1">
            천연 다당류, 천연 단백질, 합성 고분자, 세라믹의 화학 구조, 분자량, 친수성, 생체적합성 및 약물전달 특성을 검색합니다.
          </p>
        </div>

        <!-- 검색창 및 카테고리 필터 -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input type="text" id="db-search-input" oninput="UI.filterMaterialsDB()" placeholder="재료명, 작용기, 용도 검색..."
                 class="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-full sm:w-60">
          <select id="db-category-select" onchange="UI.filterMaterialsDB()"
                  class="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-sky-400 focus:outline-none focus:border-sky-500">
            <option value="all">전체 분류 (14종)</option>
            <option value="natural_polysaccharide">천연 다당류</option>
            <option value="natural_protein">천연 단백질</option>
            <option value="synthetic_polymer">합성 고분자</option>
            <option value="bioceramic">생체 세라믹</option>
            <option value="stimuli_responsive">자극 반응형</option>
          </select>
        </div>
      </div>

      <!-- 재료 카드 그리드 -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" id="mat-db-grid">
        ${this.buildMaterialCardsHTML(BIOMATERIALS_DB)}
      </div>

      <!-- 재료 상세 정보 모달 (클릭 시 오픈) -->
      <div id="modal-mat-detail" class="hidden fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative" id="modal-mat-detail-content">
          <!-- 모달 내용 동적 렌더링 -->
        </div>
      </div>
    `;
  },

  buildMaterialCardsHTML(materials) {
    if (materials.length === 0) {
      return `<div class="col-span-3 p-12 text-center text-slate-500 text-sm">일치하는 생체재료가 없습니다.</div>`;
    }

    return materials.map(m => {
      return `
        <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between group">
          <div>
            <div class="flex items-start justify-between gap-2 mb-2">
              <div>
                <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  ${m.categoryKo}
                </span>
                <h3 class="text-lg font-bold text-white mt-1 group-hover:text-sky-400 transition-colors">
                  ${m.nameKo} <span class="text-xs font-mono text-slate-400 font-normal">(${m.abbr})</span>
                </h3>
                <div class="text-[11px] text-slate-400 font-mono">${m.nameEn}</div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 my-3 text-[11px]">
              <div class="p-2 rounded-lg bg-slate-800/40 border border-slate-800">
                <span class="text-slate-500 block text-[10px]">분자량 / 식</span>
                <span class="text-slate-200 font-mono truncate block">${m.formula}</span>
              </div>
              <div class="p-2 rounded-lg bg-slate-800/40 border border-slate-800">
                <span class="text-slate-500 block text-[10px]">친수성 / 팽윤</span>
                <span class="text-sky-300 font-semibold">${m.swellingMaxPercent}% 팽윤</span>
              </div>
            </div>

            <p class="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
              ${m.drugDeliveryRole}
            </p>
          </div>

          <div class="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button onclick="UI.showMaterialDetailModal('${m.id}')" class="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1">
              상세 정보 보기 &rarr;
            </button>
            <button onclick="UI.addMaterialToActiveProject('${m.id}')" class="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold transition-all">
              + 조성에 추가
            </button>
          </div>
        </div>
      `;
    }).join("");
  },

  filterMaterialsDB() {
    const query = (document.getElementById("db-search-input")?.value || "").toLowerCase();
    const category = document.getElementById("db-category-select")?.value || "all";

    const filtered = BIOMATERIALS_DB.filter(m => {
      const matchCat = category === "all" || m.category === category;
      const matchQuery = !query || 
        m.nameKo.toLowerCase().includes(query) ||
        m.nameEn.toLowerCase().includes(query) ||
        m.abbr.toLowerCase().includes(query) ||
        m.drugDeliveryRole.toLowerCase().includes(query) ||
        m.functionalGroups.some(g => g.toLowerCase().includes(query));
      return matchCat && matchQuery;
    });

    const grid = document.getElementById("mat-db-grid");
    if (grid) grid.innerHTML = this.buildMaterialCardsHTML(filtered);
  },

  showMaterialDetailModal(matId) {
    const mat = BIOMATERIALS_DB.find(m => m.id === matId);
    if (!mat) return;

    const modal = document.getElementById("modal-mat-detail");
    const content = document.getElementById("modal-mat-detail-content");
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="flex justify-between items-start border-b border-slate-800 pb-4 mb-4">
        <div>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">${mat.categoryKo}</span>
          <h3 class="text-xl font-black text-white mt-1">${mat.nameKo} (${mat.nameEn})</h3>
          <div class="text-xs font-mono text-slate-400">약어: ${mat.abbr} | 분자식: ${mat.formula}</div>
        </div>
        <button onclick="document.getElementById('modal-mat-detail').classList.add('hidden')" class="text-slate-400 hover:text-white text-xl font-bold p-1">&times;</button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs mb-4">
        <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
          <span class="text-slate-500 text-[10px] block">분자량 범위</span>
          <span class="font-bold text-slate-200 font-mono">${mat.mwRange}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
          <span class="text-slate-500 text-[10px] block">친수성 특성</span>
          <span class="font-bold text-sky-400">${mat.hydrophilicity}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
          <span class="text-slate-500 text-[10px] block">생체적합성 점수</span>
          <span class="font-bold text-emerald-400">${mat.biocompatibilityScore} / 100</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
          <span class="text-slate-500 text-[10px] block">기계적 강도</span>
          <span class="font-bold text-slate-200">${mat.tensileStrength}</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
          <span class="text-slate-500 text-[10px] block">생분해 기간</span>
          <span class="font-bold text-slate-200">${mat.biodegradabilityDays}일</span>
        </div>
        <div class="p-3 rounded-xl bg-slate-800/50 border border-slate-800">
          <span class="text-slate-500 text-[10px] block">최대 팽윤비 (Qmax)</span>
          <span class="font-bold text-sky-400">${mat.swellingMaxPercent}%</span>
        </div>
      </div>

      <div class="space-y-3 text-xs text-slate-300">
        <div class="p-3 rounded-xl bg-slate-800/30 border border-slate-800">
          <strong class="text-sky-400 block mb-1">화학 작용기 및 가교 기전</strong>
          <div>작용기: ${mat.functionalGroups.join(", ")}</div>
          <div class="text-slate-400 mt-1">가교 방식: ${mat.crosslinkingMechanism}</div>
        </div>

        <div class="p-3 rounded-xl bg-slate-800/30 border border-slate-800">
          <strong class="text-sky-400 block mb-1">약물 전달(DDS) 분야 활용</strong>
          <p class="leading-relaxed text-slate-300">${mat.drugDeliveryRole}</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
            <strong class="block mb-1 text-emerald-400">장점 (Advantages)</strong>
            ${mat.advantages}
          </div>
          <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
            <strong class="block mb-1 text-amber-400">한계점 (Limitations)</strong>
            ${mat.limitations}
          </div>
        </div>
      </div>

      <div class="mt-5 pt-4 border-t border-slate-800 flex justify-end gap-2">
        <button onclick="document.getElementById('modal-mat-detail').classList.add('hidden')" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold">닫기</button>
        <button onclick="UI.addMaterialToActiveProject('${mat.id}'); document.getElementById('modal-mat-detail').classList.add('hidden');" class="px-4 py-2 rounded-xl bg-sky-500 text-slate-950 text-xs font-bold shadow-md">현재 프로젝트 조성에 추가</button>
      </div>
    `;

    modal.classList.remove("hidden");
  },

  addMaterialToActiveProject(matId) {
    const proj = this.getActiveProject();
    if (proj.materials.some(m => m.id === matId)) {
      this.showToast("이미 현재 프로젝트 조성에 포함되어 있습니다.");
      this.switchTab("formulation_designer");
      return;
    }

    proj.materials.push({ id: matId, ratio: 10 });
    this.normalizeProjectComposition(proj);
    proj.stage = Math.max(proj.stage, 4);
    this.saveProjectsToStorage();
    this.showToast(`재료가 프로젝트 '${proj.name}'에 추가되었습니다.`);
    this.switchTab("formulation_designer");
  },

  normalizeProjectComposition(proj) {
    const sum = proj.materials.reduce((acc, m) => acc + m.ratio, 0);
    if (sum === 0) {
      proj.materials[0].ratio = 100;
    } else {
      let accum = 0;
      proj.materials.forEach((m, idx) => {
        if (idx === proj.materials.length - 1) {
          m.ratio = 100 - accum;
        } else {
          m.ratio = Math.round((m.ratio / sum) * 100);
          accum += m.ratio;
        }
      });
    }
  },

  // --------------------------------------------------------------------------
  // ③ 재료 간 상호작용 탐색 (Material Interaction Explorer)
  // --------------------------------------------------------------------------
  renderMaterialInteraction() {
    const container = document.getElementById("tab-material_interaction");
    if (!container) return;

    const proj = this.getActiveProject();
    const defaultA = proj.materials[0]?.id || "alginate";
    const defaultB = proj.materials[1]?.id || "chitosan";

    container.innerHTML = `
      <div class="mb-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-2">
          Intermolecular Interaction & Complexation Analyzer
        </div>
        <h2 class="text-2xl font-bold text-white tracking-tight">재료 간 상호작용 탐색</h2>
        <p class="text-slate-400 text-xs md:text-sm mt-1">
          두 가지 이상의 생체재료를 선택하여 수소 결합, 이온 결합, 소수성 상호작용, 가교 결합 가능성을 화학적으로 해석합니다.
        </p>
      </div>

      <!-- 상단 재료 선택 및 환경 조건 컨트롤러 -->
      <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1.5">생체재료 A 선택</label>
            <select id="select-inter-a" onchange="UI.updateInteractionAnalysis()" class="w-full bg-slate-800 border border-slate-700 text-xs text-sky-400 rounded-xl p-2.5 focus:outline-none">
              ${BIOMATERIALS_DB.map(m => `<option value="${m.id}" ${m.id === defaultA ? 'selected' : ''}>${m.nameKo} (${m.abbr})</option>`).join("")}
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1.5">생체재료 B 선택</label>
            <select id="select-inter-b" onchange="UI.updateInteractionAnalysis()" class="w-full bg-slate-800 border border-slate-700 text-xs text-indigo-400 rounded-xl p-2.5 focus:outline-none">
              ${BIOMATERIALS_DB.map(m => `<option value="${m.id}" ${m.id === defaultB ? 'selected' : ''}>${m.nameKo} (${m.abbr})</option>`).join("")}
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1.5">용액 환경 pH (<span id="val-inter-ph" class="text-sky-400 font-bold">7.4</span>)</label>
            <input type="range" id="input-inter-ph" min="1.0" max="10.0" step="0.2" value="${proj.phCondition || 7.4}"
                   oninput="document.getElementById('val-inter-ph').textContent = this.value; UI.updateInteractionAnalysis();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-400 mb-1.5">온도 (°C: <span id="val-inter-temp" class="text-sky-400 font-bold">37</span>℃)</label>
            <input type="range" id="input-inter-temp" min="20" max="50" step="1" value="${proj.tempCondition || 37}"
                   oninput="document.getElementById('val-inter-temp').textContent = this.value; UI.updateInteractionAnalysis();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>
        </div>
      </div>

      <!-- 상호작용 분석 결과 패널 -->
      <div id="interaction-result-panel" class="space-y-6">
        <!-- 동적 렌더링 -->
      </div>
    `;

    this.updateInteractionAnalysis();
  },

  updateInteractionAnalysis() {
    const matA = document.getElementById("select-inter-a")?.value || "alginate";
    const matB = document.getElementById("select-inter-b")?.value || "chitosan";
    const ph = parseFloat(document.getElementById("input-inter-ph")?.value || "7.4");
    const temp = parseFloat(document.getElementById("input-inter-temp")?.value || "37.0");

    const analysis = PhysicsEngine.analyzeMaterialInteraction(matA, matB, { ph, temp, ionicStrength: 0.15 });
    
    // 프로젝트 상태에 상호작용 분석 결과 실시간 저장
    const proj = this.getActiveProject();
    proj.interactionAnalysis = analysis;
    proj.phCondition = ph;
    proj.tempCondition = temp;
    this.saveProjectsToStorage();

    const panel = document.getElementById("interaction-result-panel");
    if (!panel) return;

    panel.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 좌측: 화학적 상호작용 요약 및 종합 점수 -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 class="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <span>🔬 상용성 및 결합 친화도</span>
          </h3>

          <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-center">
            <span class="text-xs text-slate-400">분자 상용성 지수 (Compatibility Score)</span>
            <div class="text-4xl font-black text-sky-400 mt-2 font-mono">${analysis.compatibilityScore} <span class="text-base font-normal text-slate-400">/ 100</span></div>
            <div class="text-[11px] text-emerald-400 mt-1 font-semibold">
              ${analysis.compatibilityScore >= 80 ? '✓ 우수한 복합 겔 형성 적합성' : '중등도 상호보완적 결합'}
            </div>
          </div>

          <div class="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800 text-xs leading-relaxed text-slate-300">
            <strong class="text-sky-400 block mb-1">상호작용 총평:</strong>
            ${analysis.summaryText}
          </div>

          <button onclick="UI.applyInteractionPairToFormulation('${matA}', '${matB}')"
                  class="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md transition-all">
            이 분석 결과를 프로젝트에 저장 & 조성 설계로 전달 &rarr;
          </button>
        </div>

        <!-- 우측: 4대 상호작용 상세 카드 (2컬럼) -->
        <div class="lg:col-span-2 space-y-4">
          ${analysis.interactions.map(item => `
            <div class="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <div class="flex items-center justify-between mb-2">
                <h4 class="font-bold text-sm text-white flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
                  ${item.type}
                </h4>
                <span class="px-2.5 py-0.5 rounded text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  ${item.strength} (${item.score}점)
                </span>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed mb-2">${item.mechanism}</p>
              <div class="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-[11px] text-slate-400">
                <strong class="text-sky-300">환경 의존성:</strong> ${item.conditionEffect}
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  },

  applyInteractionPairToFormulation(matA, matB) {
    const proj = this.getActiveProject();
    
    // 두 재료가 이미 있으면 유지, 없으면 재구성
    const existsA = proj.materials.some(m => m.id === matA);
    const existsB = proj.materials.some(m => m.id === matB);

    if (!existsA || !existsB) {
      proj.materials = [
        { id: matA, ratio: 60 },
        { id: matB, ratio: 40 }
      ];
    }
    this.normalizeProjectComposition(proj);
    proj.stage = Math.max(proj.stage, 3);
    this.saveProjectsToStorage();

    this.showToast(`상호작용 분석 결과가 프로젝트 '${proj.name}'에 영구 저장되었으며 조성 설계로 이동합니다.`);
    this.switchTab("formulation_designer");
  },

  // --------------------------------------------------------------------------
  // ④ 복합재료 조성 설계 (Composite Formulation Designer - 원형 도넛 차트 탑재)
  // --------------------------------------------------------------------------
  renderFormulationDesigner() {
    const container = document.getElementById("tab-formulation_designer");
    if (!container) return;

    const proj = this.getActiveProject();
    const totalRatio = proj.materials.reduce((sum, m) => sum + m.ratio, 0);
    const isValid100 = totalRatio === 100;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold mb-2">
            Composite Formulation Studio (Mass Balance 100%)
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">복합재료 조성 설계</h2>
          <p class="text-slate-400 text-xs md:text-sm mt-1">
            복수 생체재료의 혼합 비율(wt%), 가교제 및 환경 조건을 설정하고 원형 그래프로 조성을 시각화합니다.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <div class="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 ${isValid100 ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}">
            <span id="label-formulation-total">합계: ${totalRatio}%</span>
            <span id="badge-formulation-status">${isValid100 ? '✓ (100% 정상)' : '⚠ (합계 불일치)'}</span>
          </div>
          <button onclick="UI.autoNormalizeActiveProject()" class="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-all">
            100% 자동 정규화
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 좌측: 조성비 슬라이더 및 가교 조건 (2컬럼) -->
        <div class="lg:col-span-2 space-y-6">
          <!-- 재료별 조성비 슬라이더 카드 -->
          <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800">
            <div class="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 class="font-bold text-white text-base">생체재료 배합 비율 (Polymer Formulation Ratio)</h3>
              <div class="flex items-center gap-2">
                <select id="select-add-db-mat" class="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none">
                  <option value="">+ 재료 추가...</option>
                  ${BIOMATERIALS_DB.filter(m => !proj.materials.some(pm => pm.id === m.id)).map(m => `
                    <option value="${m.id}">${m.nameKo} (${m.abbr})</option>
                  `).join("")}
                </select>
                <button onclick="UI.addMaterialFromSelect()" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 text-xs font-semibold rounded-lg">
                  추가
                </button>
              </div>
            </div>

            <div class="space-y-4" id="formulation-slider-list">
              ${proj.materials.map((m, idx) => {
                const dbMat = BIOMATERIALS_DB.find(x => x.id === m.id);
                return `
                  <div class="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
                    <div class="flex items-center justify-between mb-2">
                      <div class="flex items-center gap-2">
                        <span class="w-3 h-3 rounded-full" style="background-color: ${dbMat ? dbMat.color : '#38BDF8'}"></span>
                        <span class="font-bold text-sm text-white">${dbMat ? dbMat.nameKo : m.id}</span>
                        <span class="text-xs font-mono text-slate-400">(${dbMat ? dbMat.abbr : ''})</span>
                      </div>
                      <div class="flex items-center gap-3">
                        <input type="number" min="0" max="100" value="${m.ratio}" 
                               id="num-mat-${idx}"
                               onchange="UI.updateFormulationRatio(${idx}, this.value)"
                               class="w-16 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-right text-xs font-bold text-sky-400 focus:outline-none">
                        <span class="text-xs text-slate-400 font-bold">%</span>
                        ${proj.materials.length > 1 ? `
                          <button onclick="UI.removeFormulationMaterial(${idx})" class="text-slate-500 hover:text-rose-400 text-xs font-bold px-1.5">&times;</button>
                        ` : ''}
                      </div>
                    </div>
                    <input type="range" min="0" max="100" value="${m.ratio}"
                           id="range-mat-${idx}"
                           oninput="UI.handleSliderRatioInput(${idx}, this.value)"
                           class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
                  </div>
                `;
              }).join("")}
            </div>
          </div>

          <!-- 가교제 및 환경 조건 카드 -->
          <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800">
            <h3 class="font-bold text-white text-base mb-4 border-b border-slate-800 pb-3">
              ⚗️ 가교제, 환경 및 약물 조건 설정
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label class="block font-semibold text-slate-400 mb-1.5">가교제 종류</label>
                <select id="select-proj-crosslinker" onchange="UI.updateCrosslinkerParam(this.value)" class="w-full bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-xl p-2.5 focus:outline-none">
                  ${CROSSLINKERS.map(c => `
                    <option value="${c.id}" ${c.id === proj.crosslinker ? 'selected' : ''}>${c.name}</option>
                  `).join("")}
                </select>
              </div>

              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="font-semibold text-slate-400">가교 밀도 (wt%)</span>
                  <span id="disp-cross-density" class="font-bold text-sky-400">${proj.crosslinkerDensity} wt%</span>
                </div>
                <input type="range" min="0.5" max="5.0" step="0.1" value="${proj.crosslinkerDensity}"
                       oninput="UI.updateDensityParam(this.value)"
                       class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
              </div>

              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="font-semibold text-slate-400">환경 pH 조건</span>
                  <span id="disp-form-ph" class="font-bold text-sky-400">pH ${proj.phCondition}</span>
                </div>
                <input type="range" min="1.2" max="8.0" step="0.2" value="${proj.phCondition}"
                       oninput="UI.updatePhParam(this.value)"
                       class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
              </div>

              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="font-semibold text-slate-400">약물 함량 (Drug Loading wt%)</span>
                  <span id="disp-form-drug" class="font-bold text-sky-400">${proj.drugLoading}%</span>
                </div>
                <input type="range" min="1.0" max="20.0" step="0.5" value="${proj.drugLoading}"
                       oninput="UI.updateDrugParam(this.value)"
                       class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
              </div>
            </div>
          </div>
        </div>

        <!-- 우측: 원형 그래프(도넛 차트) 조성 시각화 패널 (1컬럼) -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 class="font-bold text-white text-base">조성비 원형 시각화</h3>
              <span class="text-xs text-slate-400 font-mono">Doughnut Chart</span>
            </div>

            <div class="w-full h-64 relative flex items-center justify-center">
              <canvas id="chart-formulation-donut"></canvas>
            </div>
          </div>

          <div class="mt-4 pt-4 border-t border-slate-800 space-y-2">
            <div class="text-xs text-slate-400">
              설계한 조성을 시뮬레이션 엔진으로 전달하여 즉시 물성과 방출 거동을 예측합니다.
            </div>
            <button onclick="UI.executeFormulationToSimulation()" class="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg transition-all text-center">
              물성 및 약물 방출 시뮬레이션 실행 &rarr;
            </button>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.initFormulationDonutChart();
    }, 50);
  },

  handleSliderRatioInput(index, val) {
    const proj = this.getActiveProject();
    const num = Math.max(0, Math.min(100, parseInt(val) || 0));
    proj.materials[index].ratio = num;
    
    // 숫자 입력창 즉시 동기화
    const numEl = document.getElementById(`num-mat-${index}`);
    if (numEl) numEl.value = num;

    // 합계 검증 배지 갱신
    const totalRatio = proj.materials.reduce((sum, m) => sum + m.ratio, 0);
    const labelTotal = document.getElementById("label-formulation-total");
    const badgeStatus = document.getElementById("badge-formulation-status");
    if (labelTotal) labelTotal.textContent = `합계: ${totalRatio}%`;
    if (badgeStatus) badgeStatus.textContent = totalRatio === 100 ? "✓ (100% 정상)" : "⚠ (합계 불일치)";

    // 차트 즉시 갱신
    this.initFormulationDonutChart();
    this.saveProjectsToStorage();
  },

  updateFormulationRatio(index, val) {
    const proj = this.getActiveProject();
    proj.materials[index].ratio = Math.max(0, Math.min(100, parseInt(val) || 0));
    this.saveProjectsToStorage();
    this.renderFormulationDesigner();
  },

  removeFormulationMaterial(index) {
    const proj = this.getActiveProject();
    if (proj.materials.length <= 1) return;
    proj.materials.splice(index, 1);
    this.normalizeProjectComposition(proj);
    this.saveProjectsToStorage();
    this.renderFormulationDesigner();
  },

  addMaterialFromSelect() {
    const sel = document.getElementById("select-add-db-mat");
    if (!sel || !sel.value) return;
    this.addMaterialToActiveProject(sel.value);
  },

  autoNormalizeActiveProject() {
    const proj = this.getActiveProject();
    this.normalizeProjectComposition(proj);
    this.saveProjectsToStorage();
    this.showToast("조성비가 100%로 균등 정규화되었습니다.");
    this.renderFormulationDesigner();
  },

  updateCrosslinkerParam(val) {
    const proj = this.getActiveProject();
    proj.crosslinker = val;
    this.saveProjectsToStorage();
    this.renderFormulationDesigner();
  },

  updateDensityParam(val) {
    const proj = this.getActiveProject();
    proj.crosslinkerDensity = parseFloat(val);
    const disp = document.getElementById("disp-cross-density");
    if (disp) disp.textContent = `${proj.crosslinkerDensity} wt%`;
    this.saveProjectsToStorage();
  },

  updatePhParam(val) {
    const proj = this.getActiveProject();
    proj.phCondition = parseFloat(val);
    const disp = document.getElementById("disp-form-ph");
    if (disp) disp.textContent = `pH ${proj.phCondition}`;
    this.saveProjectsToStorage();
  },

  updateDrugParam(val) {
    const proj = this.getActiveProject();
    proj.drugLoading = parseFloat(val);
    const disp = document.getElementById("disp-form-drug");
    if (disp) disp.textContent = `${proj.drugLoading}%`;
    this.saveProjectsToStorage();
  },

  executeFormulationToSimulation() {
    const proj = this.getActiveProject();
    const totalRatio = proj.materials.reduce((sum, m) => sum + m.ratio, 0);
    if (totalRatio !== 100) {
      this.autoNormalizeActiveProject();
    }

    // 시뮬레이션 계산 실행 및 결과 영구 보존
    const props = PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, temp: proj.tempCondition });
    const sim = PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
    proj.simulationResults = { props, sim };
    proj.stage = Math.max(proj.stage, 5);
    proj.updatedAt = new Date().toISOString().split("T")[0];
    this.saveProjectsToStorage();

    this.showToast("조성이 시뮬레이션 엔진으로 전달되어 물성 및 방출 계산이 완료되었습니다.");
    this.switchTab("property_simulation");
  },

  initFormulationDonutChart() {
    const ctx = document.getElementById("chart-formulation-donut");
    if (!ctx) return;

    const proj = this.getActiveProject();
    if (this.charts.donut) {
      this.charts.donut.destroy();
    }

    const labels = proj.materials.map(m => {
      const dbMat = BIOMATERIALS_DB.find(x => x.id === m.id);
      return dbMat ? dbMat.nameKo : m.id;
    });

    const data = proj.materials.map(m => m.ratio);
    const colors = proj.materials.map(m => {
      const dbMat = BIOMATERIALS_DB.find(x => x.id === m.id);
      return dbMat ? dbMat.color : "#38BDF8";
    });

    this.charts.donut = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: "#0F172A",
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#E2E8F0", font: { size: 11 } }
          }
        },
        cutout: "65%"
      }
    });
  },

  // --------------------------------------------------------------------------
  // ⑤ 물성 및 약물 방출 시뮬레이션 (Property & Drug Release Simulation)
  // --------------------------------------------------------------------------
  renderPropertySimulation() {
    const container = document.getElementById("tab-property_simulation");
    if (!container) return;

    const proj = this.getActiveProject();
    
    // 시뮬레이션 결과 보장
    if (!proj.simulationResults) {
      const props = PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, temp: proj.tempCondition });
      const sim = PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
      proj.simulationResults = { props, sim };
      this.saveProjectsToStorage();
    }

    const { props, sim } = proj.simulationResults;

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-2">
            In-Silico Property & Drug Release Kinetics Simulation
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">물성 및 약물 방출 시뮬레이션</h2>
          <p class="text-slate-400 text-xs md:text-sm mt-1">
            설계된 복합재료의 물리적 물성(탄성, 인장, 팽윤, 분해)과 시간에 따른 누적 약물 방출 속도를 정밀 계산합니다.
          </p>
        </div>

        <button onclick="UI.recalculateAndSaveSimulation()"
                class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center gap-2 self-start md:self-auto">
          <span>⚡ 시뮬레이션 재실행 및 결과 저장</span>
        </button>
      </div>

      <!-- 시뮬레이션 환경 컨트롤러 바 -->
      <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 mb-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs items-center">
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400 font-semibold">시험 용출액 pH (<span id="sim-disp-ph" class="text-sky-400 font-bold">${proj.phCondition}</span>)</span>
              <span class="text-[10px] text-slate-500">${proj.phCondition < 3 ? '위액 환경' : proj.phCondition > 6.5 ? '소장/대장 환경' : '중성/조직 환경'}</span>
            </div>
            <input type="range" min="1.2" max="8.0" step="0.2" value="${proj.phCondition}"
                   oninput="UI.handleSimParamChange('ph', this.value)"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400 font-semibold">약물 봉입량 (<span id="sim-disp-drug" class="text-sky-400 font-bold">${proj.drugLoading} wt%</span>)</span>
              <span class="text-[10px] text-slate-500">총 약물량: ${(proj.drugLoading * 10).toFixed(1)} mg</span>
            </div>
            <input type="range" min="1.0" max="20.0" step="0.5" value="${proj.drugLoading}"
                   oninput="UI.handleSimParamChange('drug', this.value)"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400 font-semibold">가교 밀도 (<span id="sim-disp-density" class="text-sky-400 font-bold">${proj.crosslinkerDensity} wt%</span>)</span>
              <span class="text-[10px] text-slate-500">${proj.crosslinker}</span>
            </div>
            <input type="range" min="0.5" max="5.0" step="0.1" value="${proj.crosslinkerDensity}"
                   oninput="UI.handleSimParamChange('density', this.value)"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>
        </div>
      </div>

      <!-- 5대 물성 예측 카드 그리드 -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-semibold block">탄성계수 (E)</span>
          <div class="text-2xl font-bold text-white mt-1 font-mono">${props.elasticModulusKPa} <span class="text-xs text-slate-400">kPa</span></div>
          <div class="text-[10px] text-slate-500 mt-1">압축 탄성 복원력</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-semibold block">인장강도 (UTS)</span>
          <div class="text-2xl font-bold text-white mt-1 font-mono">${props.tensileStrengthMPa} <span class="text-xs text-slate-400">MPa</span></div>
          <div class="text-[10px] text-slate-500 mt-1">최대 파열 저항 응력</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span class="text-[10px] text-sky-400 uppercase font-semibold block">평형 팽윤율 (Q)</span>
          <div class="text-2xl font-bold text-sky-400 mt-1 font-mono">${props.swellingRatioPercent}%</div>
          <div class="text-[10px] text-slate-500 mt-1">수분 흡수 배수</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <span class="text-[10px] text-slate-400 uppercase font-semibold block">생분해 속도</span>
          <div class="text-2xl font-bold text-slate-200 mt-1 font-mono">${props.biodegradationDays} <span class="text-xs text-slate-400">일</span></div>
          <div class="text-[10px] text-slate-500 mt-1">체내 완전 대사/배설</div>
        </div>
        <div class="p-4 rounded-xl bg-slate-900 border border-slate-800 col-span-2 md:col-span-1">
          <span class="text-[10px] text-emerald-400 uppercase font-semibold block">생체적합성 지표</span>
          <div class="text-2xl font-bold text-emerald-400 mt-1 font-mono">${props.biocompatibilityScore} <span class="text-xs text-slate-400">/ 100</span></div>
          <div class="text-[10px] text-slate-500 mt-1">세포 독성 저항성</div>
        </div>
      </div>

      <!-- 약물 방출 시뮬레이션 선 그래프(Line Chart) & 세부 수치 요약 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 선 그래프 (2컬럼) -->
        <div class="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div>
              <h3 class="font-bold text-white text-base">시간에 따른 약물 누적 방출 곡선 (Cumulative Drug Release)</h3>
              <p class="text-xs text-slate-400 mt-0.5">Korsmeyer-Peppas 동적 확산-팽윤 모델 적용 (n = ${sim.nExponent}, R² = ${sim.r2Score})</p>
            </div>
            <span class="px-2.5 py-1 rounded-lg text-xs font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
              pH ${proj.phCondition} | 37℃
            </span>
          </div>

          <div class="w-full h-80 relative">
            <canvas id="chart-drug-release-line"></canvas>
          </div>
        </div>

        <!-- 4대 약물 방출 예측 항목 패널 (1컬럼) -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 class="font-bold text-white text-base border-b border-slate-800 pb-3">
            🎯 약물 방출 동역학 평가 항목
          </h3>

          <div class="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
            <span class="text-xs text-slate-400 block">초기 방출 속도 (1시간 버스트율)</span>
            <div class="text-2xl font-black text-sky-400 mt-1">${sim.initialBurstRate}% / h</div>
            <div class="text-[11px] text-slate-500 mt-0.5">초기 급격 방출 억제도 양호</div>
          </div>

          <div class="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
            <span class="text-xs text-slate-400 block">24시간 누적 약물 방출률</span>
            <div class="text-2xl font-black text-emerald-400 mt-1">${sim.release24h}%</div>
            <div class="text-[11px] text-slate-500 mt-0.5">방출된 약물량: 약 ${sim.amountReleasedMg[sim.amountReleasedMg.length - 1]} mg</div>
          </div>

          <div class="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
            <span class="text-xs text-slate-400 block">약물 방출 지속 시간 (t80% 도달)</span>
            <div class="text-2xl font-black text-indigo-400 mt-1">${sim.sustainedDurationHours} <span class="text-xs text-slate-400">시간</span></div>
            <div class="text-[11px] text-slate-500 mt-0.5">서방형 제제 요건 충족</div>
          </div>

          <div class="p-3.5 rounded-xl bg-slate-800/20 border border-slate-800 text-xs text-slate-400 leading-relaxed">
            <strong class="text-slate-300 block mb-1">방출 메커니즘:</strong>
            ${sim.mechanismText}
          </div>

          <button onclick="UI.passSimulationToInverseDesign()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md transition-all">
            이 결과를 목표로 역설계 탐색 &rarr;
          </button>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.initDrugReleaseLineChart(sim);
    }, 50);
  },

  handleSimParamChange(type, val) {
    const proj = this.getActiveProject();
    if (type === "ph") {
      proj.phCondition = parseFloat(val);
      const disp = document.getElementById("sim-disp-ph");
      if (disp) disp.textContent = proj.phCondition;
    } else if (type === "drug") {
      proj.drugLoading = parseFloat(val);
      const disp = document.getElementById("sim-disp-drug");
      if (disp) disp.textContent = `${proj.drugLoading} wt%`;
    } else if (type === "density") {
      proj.crosslinkerDensity = parseFloat(val);
      const disp = document.getElementById("sim-disp-density");
      if (disp) disp.textContent = `${proj.crosslinkerDensity} wt%`;
    }
    this.recalculateAndSaveSimulation(false);
  },

  recalculateAndSaveSimulation(showToast = true) {
    const proj = this.getActiveProject();
    const props = PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, temp: proj.tempCondition });
    const sim = PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
    proj.simulationResults = { props, sim };
    proj.stage = Math.max(proj.stage, 5);
    proj.updatedAt = new Date().toISOString().split("T")[0];
    this.saveProjectsToStorage();

    if (showToast) {
      this.showToast("시뮬레이션이 최신 파라미터로 계산되어 프로젝트에 저장되었습니다.");
    }
    this.renderPropertySimulation();
  },

  passSimulationToInverseDesign() {
    const proj = this.getActiveProject();
    const props = proj.simulationResults.props;
    const sim = proj.simulationResults.sim;
    
    proj.inverseTargets = {
      targetModulus: Math.round(props.elasticModulusKPa),
      targetSwelling: Math.round(props.swellingRatioPercent),
      targetRelease: Math.round(sim.release24h),
      targetBiodegradation: Math.round(props.biodegradationDays)
    };
    proj.stage = Math.max(proj.stage, 6);
    this.saveProjectsToStorage();
    this.showToast("시뮬레이션 결과가 역설계 목표값으로 전달되었습니다.");
    this.switchTab("inverse_design");
  },

  initDrugReleaseLineChart(sim) {
    const ctx = document.getElementById("chart-drug-release-line");
    if (!ctx) return;

    if (this.charts.releaseLine) {
      this.charts.releaseLine.destroy();
    }

    this.charts.releaseLine = new Chart(ctx, {
      type: "line",
      data: {
        labels: sim.timePoints.map(t => `${t}h`),
        datasets: [{
          label: "누적 약물 방출률 (%)",
          data: sim.cumulativeRelease,
          borderColor: "#38BDF8",
          backgroundColor: "rgba(56, 189, 248, 0.15)",
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: "#38BDF8"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0F172A",
            titleColor: "#F8FAFC",
            bodyColor: "#94A3B8",
            borderColor: "#334155",
            borderWidth: 1,
            callbacks: {
              label: (c) => ` 방출률: ${c.parsed.y}%`
            }
          }
        },
        scales: {
          x: {
            grid: { color: "#1E293B" },
            ticks: { color: "#94A3B8" }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: "#1E293B" },
            ticks: {
              color: "#94A3B8",
              callback: (v) => `${v}%`
            }
          }
        }
      }
    });
  },

  // --------------------------------------------------------------------------
  // ⑥ 목표 물성 기반 역설계 (Inverse Design)
  // --------------------------------------------------------------------------
  renderInverseDesign() {
    const container = document.getElementById("tab-inverse_design");
    if (!container) return;

    const proj = this.getActiveProject();
    const targets = proj.inverseTargets || {
      targetModulus: 30,
      targetSwelling: 1200,
      targetRelease: 85,
      targetBiodegradation: 28
    };

    container.innerHTML = `
      <div class="mb-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold mb-2">
          Target-Driven Inverse Formulation Engine
        </div>
        <h2 class="text-2xl font-bold text-white tracking-tight">목표 물성 기반 역설계</h2>
        <p class="text-slate-400 text-xs md:text-sm mt-1">
          사용자가 원하는 목표 물성을 입력하면 AI 알고리즘이 이에 부합하는 최적의 복합재료 조성 후보 3~5개를 역방향으로 도출합니다.
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 목표 물성 입력 패널 -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 class="font-bold text-white text-base border-b border-slate-800 pb-3">
            🎯 목표 물성(Target Properties) 입력
          </h3>

          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-400 font-semibold">목표 탄성계수 (E)</span>
              <span id="disp-inv-modulus" class="font-bold text-sky-400">${targets.targetModulus} kPa</span>
            </div>
            <input type="range" id="input-inv-modulus" min="10" max="80" value="${targets.targetModulus}"
                   oninput="document.getElementById('disp-inv-modulus').textContent = this.value + ' kPa'"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>

          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-400 font-semibold">목표 팽윤율 (Swelling Q)</span>
              <span id="disp-inv-swelling" class="font-bold text-sky-400">${targets.targetSwelling}%</span>
            </div>
            <input type="range" id="input-inv-swelling" min="300" max="2200" step="50" value="${targets.targetSwelling}"
                   oninput="document.getElementById('disp-inv-swelling').textContent = this.value + '%'"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>

          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-400 font-semibold">목표 약물 방출률 (24h)</span>
              <span id="disp-inv-release" class="font-bold text-emerald-400">${targets.targetRelease}%</span>
            </div>
            <input type="range" id="input-inv-release" min="50" max="98" value="${targets.targetRelease}"
                   oninput="document.getElementById('disp-inv-release').textContent = this.value + '%'"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400">
          </div>

          <div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-400 font-semibold">목표 분해 시간 (Days)</span>
              <span id="disp-inv-biodeg" class="font-bold text-indigo-400">${targets.targetBiodegradation}일</span>
            </div>
            <input type="range" id="input-inv-biodeg" min="7" max="90" value="${targets.targetBiodegradation}"
                   oninput="document.getElementById('disp-inv-biodeg').textContent = this.value + '일'"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400">
          </div>

          <button onclick="UI.executeInverseDesignSearch()"
                  class="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2">
            <span>⚡ AI 역설계 실행 (Generate Candidates)</span>
          </button>
        </div>

        <!-- 역설계 추천 후보 3~5개 비교 결과 패널 (2컬럼) -->
        <div class="lg:col-span-2 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 class="font-bold text-white text-base">역설계 도출 후보군 (Inverse Design Candidates)</h3>
            <span class="text-xs text-sky-400 font-mono">5 Archetype Candidates Evaluated</span>
          </div>

          <div id="inverse-candidates-container" class="space-y-4">
            <!-- 동적 후보 렌더링 -->
          </div>
        </div>
      </div>
    `;

    this.executeInverseDesignSearch(false);
  },

  executeInverseDesignSearch(showToast = true) {
    const targetModulus = parseInt(document.getElementById("input-inv-modulus")?.value) || 30;
    const targetSwelling = parseInt(document.getElementById("input-inv-swelling")?.value) || 1200;
    const targetRelease = parseInt(document.getElementById("input-inv-release")?.value) || 85;
    const targetBiodegradation = parseInt(document.getElementById("input-inv-biodeg")?.value) || 28;

    const targets = { targetModulus, targetSwelling, targetRelease, targetBiodegradation };
    const candidates = PhysicsEngine.runInverseDesign(targets);

    // 프로젝트 상태에 역설계 목표 및 결과 저장
    const proj = this.getActiveProject();
    proj.inverseTargets = targets;
    proj.inverseResults = candidates;
    proj.stage = Math.max(proj.stage, 6);
    this.saveProjectsToStorage();

    if (showToast) {
      this.showToast("목표 물성에 부합하는 5개 최적 조성 후보가 역설계되었습니다.");
    }

    const container = document.getElementById("inverse-candidates-container");
    if (!container) return;

    container.innerHTML = candidates.map((c, idx) => {
      const compStr = c.composition.map(comp => {
        const dbMat = BIOMATERIALS_DB.find(x => x.id === comp.id);
        return `<span class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[11px]">${dbMat ? dbMat.nameKo : comp.id} <strong>${comp.ratio}%</strong></span>`;
      }).join(" ");

      return `
        <div class="p-5 rounded-2xl bg-slate-900 border ${idx === 0 ? 'border-sky-500/50 shadow-lg shadow-sky-500/10' : 'border-slate-800'} transition-all">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-full ${idx === 0 ? 'bg-sky-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-300'} text-xs flex items-center justify-center font-bold">
                #${idx + 1}
              </span>
              <h4 class="font-bold text-white text-sm">${c.name}</h4>
              ${idx === 0 ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">최우수 일치도</span>' : ''}
            </div>
            <div class="text-right">
              <span class="text-[11px] text-slate-400">목표 적합도:</span>
              <span class="text-base font-black text-sky-400 font-mono ml-1">${c.matchScore}%</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5 mb-3">
            ${compStr}
            <span class="px-2 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700 text-[11px]">가교제: ${c.crosslinker} (${c.crosslinkerDensity} wt%)</span>
          </div>

          <!-- 목표값과 예측값의 차이(Delta) 테이블 -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border-t border-slate-800 pt-3">
            <div class="p-2 rounded-lg bg-slate-800/40">
              <span class="text-slate-500 text-[10px] block">탄성계수 (목표: ${targetModulus})</span>
              <div class="font-bold text-white">${c.predictedProps.elasticModulusKPa} kPa <span class="text-[10px] ${c.differences.modulus >= 0 ? 'text-sky-400' : 'text-amber-400'} font-mono">(${c.differences.modulus >= 0 ? '+' : ''}${c.differences.modulus})</span></div>
            </div>
            <div class="p-2 rounded-lg bg-slate-800/40">
              <span class="text-slate-500 text-[10px] block">팽윤율 (목표: ${targetSwelling}%)</span>
              <div class="font-bold text-white">${c.predictedProps.swellingRatioPercent}% <span class="text-[10px] ${c.differences.swelling >= 0 ? 'text-sky-400' : 'text-amber-400'} font-mono">(${c.differences.swelling >= 0 ? '+' : ''}${c.differences.swelling})</span></div>
            </div>
            <div class="p-2 rounded-lg bg-slate-800/40">
              <span class="text-slate-500 text-[10px] block">방출률 (목표: ${targetRelease}%)</span>
              <div class="font-bold text-emerald-400">${c.predictedRelease}% <span class="text-[10px] ${c.differences.release >= 0 ? 'text-emerald-400' : 'text-amber-400'} font-mono">(${c.differences.release >= 0 ? '+' : ''}${c.differences.release})</span></div>
            </div>
            <div class="p-2 rounded-lg bg-slate-800/40">
              <span class="text-slate-500 text-[10px] block">분해시간 (목표: ${targetBiodegradation}일)</span>
              <div class="font-bold text-indigo-400">${c.predictedProps.biodegradationDays}일 <span class="text-[10px] font-mono">(${c.differences.biodegradation >= 0 ? '+' : ''}${c.differences.biodegradation})</span></div>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-slate-800/60 flex justify-end">
            <button onclick='UI.applyCandidateToActiveProject(${JSON.stringify(c)})'
                    class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 font-bold text-xs border border-slate-700 transition-all">
              이 후보 조성을 현재 프로젝트에 적용 &rarr;
            </button>
          </div>
        </div>
      `;
    }).join("");
  },

  applyCandidateToActiveProject(candidate) {
    const proj = this.getActiveProject();
    proj.materials = JSON.parse(JSON.stringify(candidate.composition));
    proj.crosslinker = candidate.crosslinker;
    proj.crosslinkerDensity = candidate.crosslinkerDensity;
    proj.selectedInverseCandidate = candidate;
    
    // 시뮬레이션 결과 자동 갱신
    const props = PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, temp: proj.tempCondition });
    const sim = PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
    proj.simulationResults = { props, sim };
    proj.stage = Math.max(proj.stage, 6);
    this.saveProjectsToStorage();

    this.showToast(`후보 '${candidate.name}'이(가) 프로젝트에 정식 반영되었습니다.`);
    this.switchTab("formulation_designer");
  },

  // --------------------------------------------------------------------------
  // ⑦ 다목적 최적화 및 후보 순위 (Multi-objective Optimization)
  // --------------------------------------------------------------------------
  renderMultiObjectiveOpt() {
    const container = document.getElementById("tab-multi_objective_opt");
    if (!container) return;

    const proj = this.getActiveProject();
    const weights = proj.optimizationWeights || { duration: 25, biocompatibility: 25, strength: 20, biodegradation: 15, cost: 15 };

    container.innerHTML = `
      <div class="mb-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-2">
          Multi-Objective Pareto & Desirability Optimization
        </div>
        <h2 class="text-2xl font-bold text-white tracking-tight">다목적 최적화 및 후보 순위</h2>
        <p class="text-slate-400 text-xs md:text-sm mt-1">
          약물 방출 지속시간, 생체적합성, 기계적 강도, 생분해 시간, 재료 비용의 5대 가중치를 조절하여 종합 최적 후보군을 산출합니다.
        </p>
      </div>

      <!-- 5대 목표 가중치 슬라이더 바 -->
      <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 mb-6">
        <h3 class="font-bold text-white text-base mb-4 border-b border-slate-800 pb-3">
          ⚖️ 사용자 다목적 가중치(Weights %) 설정
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400">방출 지속 시간</span>
              <span id="disp-w-dur" class="font-bold text-sky-400">${weights.duration}%</span>
            </div>
            <input type="range" id="weight-dur" min="0" max="50" value="${weights.duration}"
                   oninput="document.getElementById('disp-w-dur').textContent = this.value + '%'; UI.runMultiObjOpt();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400">
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400">생체적합성</span>
              <span id="disp-w-bio" class="font-bold text-emerald-400">${weights.biocompatibility}%</span>
            </div>
            <input type="range" id="weight-bio" min="0" max="50" value="${weights.biocompatibility}"
                   oninput="document.getElementById('disp-w-bio').textContent = this.value + '%'; UI.runMultiObjOpt();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400">
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400">기계적 강도</span>
              <span id="disp-w-str" class="font-bold text-blue-400">${weights.strength}%</span>
            </div>
            <input type="range" id="weight-str" min="0" max="50" value="${weights.strength}"
                   oninput="document.getElementById('disp-w-str').textContent = this.value + '%'; UI.runMultiObjOpt();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-400">
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400">생분해 시간</span>
              <span id="disp-w-deg" class="font-bold text-indigo-400">${weights.biodegradation}%</span>
            </div>
            <input type="range" id="weight-deg" min="0" max="50" value="${weights.biodegradation}"
                   oninput="document.getElementById('disp-w-deg').textContent = this.value + '%'; UI.runMultiObjOpt();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-400">
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-slate-400">재료 비용 최소화</span>
              <span id="disp-w-cost" class="font-bold text-amber-400">${weights.cost}%</span>
            </div>
            <input type="range" id="weight-cost" min="0" max="50" value="${weights.cost}"
                   oninput="document.getElementById('disp-w-cost').textContent = this.value + '%'; UI.runMultiObjOpt();"
                   class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-400">
          </div>
        </div>
      </div>

      <!-- 상단 시각화: 레이더 차트 & 다목적 산점도 (Scatter Plot) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 class="font-bold text-white text-base mb-1">상위 후보 다면 특성 레이더 비교</h3>
          <p class="text-xs text-slate-400 mb-3">방출 지속, 생체적합성, 강도, 분해시간, 비용 경쟁력 비교</p>
          <div class="w-full h-72 relative">
            <canvas id="chart-opt-radar"></canvas>
          </div>
        </div>

        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 class="font-bold text-white text-base mb-1">다목적 최적화 산점도 (Scatter Trade-off)</h3>
          <p class="text-xs text-slate-400 mb-3">X축: 기계적 탄성률(kPa) vs Y축: 종합 만족도 점수(Overall Score)</p>
          <div class="w-full h-72 relative">
            <canvas id="chart-opt-scatter"></canvas>
          </div>
        </div>
      </div>

      <!-- 후보 순위표 (상위 3개 강조 표시) -->
      <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <h3 class="font-bold text-white text-base mb-4 border-b border-slate-800 pb-3">
          🏆 최적 후보 순위표 (Top-3 Candidates Highlighted)
        </h3>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
            <thead class="bg-slate-800/80 text-slate-400 uppercase text-[10px]">
              <tr>
                <th class="p-3">순위</th>
                <th class="p-3">후보명</th>
                <th class="p-3">조성 배합비</th>
                <th class="p-3">지속시간</th>
                <th class="p-3">생체적합성</th>
                <th class="p-3">탄성률</th>
                <th class="p-3">종합 점수</th>
                <th class="p-3 text-right">선택 및 적용</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800" id="opt-ranking-tbody">
              <!-- 동적 순위표 렌더링 -->
            </tbody>
          </table>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.runMultiObjOpt();
    }, 50);
  },

  runMultiObjOpt() {
    const wDur = parseInt(document.getElementById("weight-dur")?.value) || 25;
    const wBio = parseInt(document.getElementById("weight-bio")?.value) || 25;
    const wStr = parseInt(document.getElementById("weight-str")?.value) || 20;
    const wDeg = parseInt(document.getElementById("weight-deg")?.value) || 15;
    const wCost = parseInt(document.getElementById("weight-cost")?.value) || 15;

    const weights = { duration: wDur, biocompatibility: wBio, strength: wStr, biodegradation: wDeg, cost: wCost };
    const results = PhysicsEngine.runMultiObjectiveOptimization(weights);

    // 프로젝트 상태에 가중치 및 순위 결과 저장
    const proj = this.getActiveProject();
    proj.optimizationWeights = weights;
    proj.optimizationResults = results;
    proj.stage = Math.max(proj.stage, 7);
    this.saveProjectsToStorage();

    // 순위표 갱신
    const tbody = document.getElementById("opt-ranking-tbody");
    if (tbody) {
      tbody.innerHTML = results.map((c, idx) => {
        const isTop3 = idx < 3;
        const compStr = c.composition.map(comp => {
          const m = BIOMATERIALS_DB.find(x => x.id === comp.id);
          return `${m ? m.nameKo : comp.id}(${comp.ratio}%)`;
        }).join(", ");

        return `
          <tr class="${isTop3 ? 'bg-sky-500/10' : 'hover:bg-slate-800/40'}">
            <td class="p-3 font-bold font-mono">
              <span class="px-2 py-0.5 rounded ${idx === 0 ? 'bg-sky-500 text-slate-950 font-black' : isTop3 ? 'bg-slate-800 text-sky-400 border border-sky-500/30' : 'text-slate-400'}">
                #${idx + 1}
              </span>
            </td>
            <td class="p-3 font-semibold text-white">${c.name}</td>
            <td class="p-3 text-slate-300 font-mono text-[11px]">${compStr}</td>
            <td class="p-3 text-slate-300 font-mono">${c.sustainedHours}h</td>
            <td class="p-3 text-emerald-400 font-mono">${c.subScores.biocompatibility}</td>
            <td class="p-3 text-blue-400 font-mono">${c.predictedProps.elasticModulusKPa} kPa</td>
            <td class="p-3 font-black text-sky-400 font-mono text-sm">${c.overallScore}</td>
            <td class="p-3 text-right">
              <button onclick='UI.selectOptimalCandidate(${JSON.stringify(c)})'
                      class="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold shadow-md transition-all">
                최종 채택
              </button>
            </td>
          </tr>
        `;
      }).join("");
    }

    // 레이더 차트 갱신
    const ctxRadar = document.getElementById("chart-opt-radar");
    if (ctxRadar) {
      if (this.charts.optRadar) this.charts.optRadar.destroy();
      const top1 = results[0];
      const top2 = results[1];

      this.charts.optRadar = new Chart(ctxRadar, {
        type: "radar",
        data: {
          labels: ["방출 지속성", "생체적합성", "기계적 강도", "생분해 적정성", "비용 경쟁력"],
          datasets: [
            {
              label: `#1 ${top1.name.split(' ')[0]}`,
              data: [top1.subScores.duration, top1.subScores.biocompatibility, top1.subScores.strength, top1.subScores.biodegradation, top1.subScores.cost],
              borderColor: "#38BDF8",
              backgroundColor: "rgba(56, 189, 248, 0.25)",
              borderWidth: 2
            },
            {
              label: `#2 ${top2.name.split(' ')[0]}`,
              data: [top2.subScores.duration, top2.subScores.biocompatibility, top2.subScores.strength, top2.subScores.biodegradation, top2.subScores.cost],
              borderColor: "#818CF8",
              backgroundColor: "rgba(129, 140, 248, 0.2)",
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: "#E2E8F0" } } },
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { display: false },
              grid: { color: "#1E293B" },
              pointLabels: { color: "#94A3B8", font: { size: 10, weight: "bold" } }
            }
          }
        }
      });
    }

    // 산점도 갱신
    const ctxScatter = document.getElementById("chart-opt-scatter");
    if (ctxScatter) {
      if (this.charts.optScatter) this.charts.optScatter.destroy();

      const scatterData = results.map(c => ({
        x: c.predictedProps.elasticModulusKPa,
        y: c.overallScore,
        candidate: c
      }));

      this.charts.optScatter = new Chart(ctxScatter, {
        type: "scatter",
        data: {
          datasets: [{
            label: "후보군 분포",
            data: scatterData,
            backgroundColor: (ctx) => ctx.dataIndex < 3 ? "#38BDF8" : "rgba(100, 116, 139, 0.5)",
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#0F172A",
              callbacks: {
                label: (c) => ` ${c.raw.candidate.name}: 강도 ${c.parsed.x} kPa, 점수 ${c.parsed.y}점`
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: "기계적 탄성률 (kPa)", color: "#94A3B8" },
              grid: { color: "#1E293B" },
              ticks: { color: "#94A3B8" }
            },
            y: {
              title: { display: true, text: "종합 만족도 점수", color: "#94A3B8" },
              grid: { color: "#1E293B" },
              ticks: { color: "#94A3B8" }
            }
          }
        }
      });
    }
  },

  selectOptimalCandidate(candidate) {
    const proj = this.getActiveProject();
    proj.materials = JSON.parse(JSON.stringify(candidate.composition));
    proj.crosslinker = candidate.crosslinker;
    proj.crosslinkerDensity = candidate.crosslinkerDensity;
    proj.optimalCandidate = candidate;
    
    // 시뮬레이션 및 상호작용 자동 동기화
    const props = PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, temp: proj.tempCondition });
    const sim = PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
    proj.simulationResults = { props, sim };
    proj.stage = Math.max(proj.stage, 7);
    this.saveProjectsToStorage();

    this.showToast(`최적 후보 '${candidate.name}'이(가) 프로젝트에 공식 채택되었습니다.`);
    this.switchTab("explainable_ai");
  },

  // --------------------------------------------------------------------------
  // ⑧ 추천 근거와 변수 영향 분석 (Explainable AI - SHAP 스타일 가로 막대 차트)
  // --------------------------------------------------------------------------
  renderExplainableAI() {
    const container = document.getElementById("tab-explainable_ai");
    if (!container) return;

    const proj = this.getActiveProject();
    const xai = PhysicsEngine.explainDesign(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition });

    container.innerHTML = `
      <div class="mb-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-2">
          Explainable AI (XAI) & Feature Attribution Analysis
        </div>
        <h2 class="text-2xl font-bold text-white tracking-tight">추천 근거와 변수 영향 분석</h2>
        <p class="text-slate-400 text-xs md:text-sm mt-1">
          AI가 특정 조성을 추천한 물리화학적 이유와 주요 설계 변수의 기여도를 투명하게 분석합니다.
        </p>
      </div>

      <!-- 교육용 데이터 표시 배너 -->
      <div class="p-3.5 rounded-xl bg-slate-900 border border-sky-500/30 text-xs text-sky-300 flex items-center justify-between mb-6">
        <span class="flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
          ${xai.disclaimer}
        </span>
        <span class="px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono text-[10px] font-bold">EDUCATIONAL IN-SILICO</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 좌측: 변수 중요도 그래프 (SHAP 스타일 가로 막대 차트) 2컬럼 -->
        <div class="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div class="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div>
              <h3 class="font-bold text-white text-base">설계 변수 중요도 분석 (Feature Importance)</h3>
              <p class="text-xs text-slate-400 mt-0.5">물성 및 방출 제어에 기여한 변수별 상대 가중치</p>
            </div>
            <span class="text-xs text-sky-400 font-mono font-bold">Relative Contribution</span>
          </div>

          <div class="w-full h-64 relative mb-6">
            <canvas id="chart-xai-importance"></canvas>
          </div>

          <div class="space-y-3">
            ${xai.importances.map(item => `
              <div class="p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs">
                <div class="flex justify-between items-center mb-1">
                  <span class="font-bold text-white">${item.variable}</span>
                  <span class="font-mono text-sky-400 font-bold">${item.impact}</span>
                </div>
                <p class="text-slate-400 leading-relaxed">${item.mechanism}</p>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- 우측: 추천 이유 및 후보별 장단점 (1컬럼) -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 class="font-bold text-white text-base border-b border-slate-800 pb-3">
            💡 AI 추천 근거 및 장단점 평가
          </h3>

          <div class="p-4 rounded-xl bg-slate-800/50 border border-slate-800">
            <span class="text-xs font-bold text-sky-400 block mb-1">핵심 추천 사유</span>
            <p class="text-xs text-slate-300 leading-relaxed">${xai.recommendationReason}</p>
          </div>

          <div class="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span class="text-xs font-bold text-emerald-400 block mb-1.5">후보 장점 (Pros)</span>
            <ul class="text-xs text-slate-300 space-y-1 list-disc list-inside">
              ${xai.prosAndCons.pros.map(p => `<li>${p}</li>`).join("")}
            </ul>
          </div>

          <div class="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <span class="text-xs font-bold text-amber-400 block mb-1.5">후보 한계 및 보완점 (Cons)</span>
            <ul class="text-xs text-slate-300 space-y-1 list-disc list-inside">
              ${xai.prosAndCons.cons.map(c => `<li>${c}</li>`).join("")}
            </ul>
          </div>

          <button onclick="UI.passXaiToExperimentalDesign()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md transition-all">
            이 근거를 바탕으로 후속 실험 설계 &rarr;
          </button>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.initXAIChart(xai);
    }, 50);
  },

  passXaiToExperimentalDesign() {
    const proj = this.getActiveProject();
    proj.stage = Math.max(proj.stage, 8);
    this.saveProjectsToStorage();
    this.switchTab("experimental_design");
  },

  initXAIChart(xai) {
    const ctx = document.getElementById("chart-xai-importance");
    if (!ctx) return;

    if (this.charts.xai) this.charts.xai.destroy();

    this.charts.xai = new Chart(ctx, {
      type: "bar",
      data: {
        labels: xai.importances.map(i => i.variable),
        datasets: [{
          label: "변수 기여도 가중치",
          data: xai.importances.map(i => i.importance),
          backgroundColor: "#38BDF8",
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: "#1E293B" },
            ticks: { color: "#94A3B8" }
          },
          y: {
            grid: { display: false },
            ticks: { color: "#E2E8F0", font: { size: 11, weight: "bold" } }
          }
        }
      }
    });
  },

  // --------------------------------------------------------------------------
  // ⑨ 후속 실험 설계 (Experimental Design)
  // --------------------------------------------------------------------------
  renderExperimentalDesign() {
    const container = document.getElementById("tab-experimental_design");
    if (!container) return;

    const proj = this.getActiveProject();
    
    // 현재 프로젝트의 실제 배합비와 가교 조건에 기반하여 실험 설계 프로토콜 동적 생성
    const protocol = PhysicsEngine.generateDynamicExperimentProtocol(proj);
    proj.experimentProtocol = protocol;
    this.saveProjectsToStorage();

    container.innerHTML = `
      <div class="mb-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
          Laboratory Experimental Protocol & DOE Verification
        </div>
        <h2 class="text-2xl font-bold text-white tracking-tight">후속 실험 설계</h2>
        <p class="text-slate-400 text-xs md:text-sm mt-1">
          AI가 추천한 복합재료 조성을 실험실에서 합성 및 검증하기 위한 실험군, 대조군, 측정 항목 및 프로토콜을 제안합니다.
        </p>
      </div>

      <!-- 동적 연구 주제 헤더 카드 -->
      <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 mb-6">
        <span class="text-xs font-bold text-sky-400 uppercase tracking-wider">프로젝트 특화 연구 주제 (Research Topic)</span>
        <h3 class="text-lg font-bold text-white mt-1">
          ${protocol.topic}
        </h3>
        <p class="text-xs text-slate-400 mt-2 leading-relaxed">
          ${protocol.hypothesis}
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- 좌측: 실험군 및 대조군 조성 차이 표 (2컬럼) -->
        <div class="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 class="font-bold text-white text-base mb-4 border-b border-slate-800 pb-3">
            🧪 실험군별 배합 조성 설계 (DOE Experimental Groups)
          </h3>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
              <thead class="bg-slate-800 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th class="p-3">실험군 ID</th>
                  <th class="p-3">군 명칭 및 역할</th>
                  <th class="p-3">배합 조성비</th>
                  <th class="p-3">가교제 조건</th>
                  <th class="p-3">예상 검증 결과</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800 text-slate-300">
                ${protocol.runs.map((r, i) => `
                  <tr class="${i === 0 ? 'bg-sky-500/10' : i >= 3 ? 'bg-slate-800/30' : 'hover:bg-slate-800/40'}">
                    <td class="p-3 font-bold font-mono ${i === 0 ? 'text-sky-400' : 'text-slate-300'}">${r.id}</td>
                    <td class="p-3 font-semibold text-white">
                      ${r.label}
                      <span class="block text-[10px] text-slate-400 font-normal font-mono">${r.role}</span>
                    </td>
                    <td class="p-3 font-mono text-[11px]">${r.compositionDesc}</td>
                    <td class="p-3 font-mono text-[11px] text-amber-300">${r.crosslinkerDesc}</td>
                    <td class="p-3 text-[11px] text-slate-400">${r.expectedOutcome}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 우측: 측정 항목 및 검증 기준 (1컬럼) -->
        <div class="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 class="font-bold text-white text-base border-b border-slate-800 pb-3">
            📋 핵심 측정 항목 및 검증 프로토콜
          </h3>

          <div class="space-y-3 text-xs">
            ${protocol.measurementProtocols.map(mp => `
              <div class="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <span class="font-bold text-sky-400 block mb-1">${mp.name}</span>
                <p class="text-slate-400 leading-relaxed">${mp.detail}</p>
              </div>
            `).join("")}
          </div>

          <button onclick="UI.finalizeExperimentProtocol()" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md transition-all">
            실험 프로토콜 확정 및 연구 보고서에 등록 &rarr;
          </button>
        </div>
      </div>
    `;
  },

  finalizeExperimentProtocol() {
    const proj = this.getActiveProject();
    proj.stage = 9;
    proj.status = "completed";
    proj.updatedAt = new Date().toISOString().split("T")[0];
    this.saveProjectsToStorage();

    this.showToast(`실험 프로토콜이 승인되었으며 최종 종합 보고서가 발행되었습니다.`);
    this.switchTab("research_report");
  },

  // --------------------------------------------------------------------------
  // ⑩ 분석 결과 및 보고서 (Research Report - 인쇄 & 다운로드)
  // --------------------------------------------------------------------------
  renderResearchReport() {
    const container = document.getElementById("tab-research_report");
    if (!container) return;

    const proj = this.getActiveProject();
    const props = proj.simulationResults?.props || PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition });
    const sim = proj.simulationResults?.sim || PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
    const xai = PhysicsEngine.explainDesign(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition });
    const inter = proj.interactionAnalysis || PhysicsEngine.analyzeMaterialInteraction(proj.materials[0]?.id || "alginate", proj.materials[1]?.id || "chitosan");
    const protocol = proj.experimentProtocol || PhysicsEngine.generateDynamicExperimentProtocol(proj);
    const invCand = proj.selectedInverseCandidate;
    const optCand = proj.optimalCandidate;

    const now = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

    container.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold mb-2">
            Integrated Scientific Dossier & Export
          </div>
          <h2 class="text-2xl font-bold text-white tracking-tight">분석 결과 및 종합 연구 보고서</h2>
          <p class="text-slate-400 text-xs md:text-sm mt-1">
            프로젝트 개요, 재료 조성, 상호작용 분석, 물성 예측, 역설계 및 후속 실험 계획을 집대성한 정식 연구 문서입니다.
          </p>
        </div>

        <div class="flex items-center gap-3">
          <button onclick="window.print()" class="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition-all flex items-center gap-2">
            🖨️ 보고서 인쇄 (PDF)
          </button>
          <button onclick="UI.downloadReportMarkdown()" class="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2">
            📥 Markdown 다운로드
          </button>
        </div>
      </div>

      <!-- 학술 문서 스타일의 보고서 본문 -->
      <div class="p-8 md:p-10 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 shadow-2xl space-y-8 printable-dossier">
        <!-- 헤더 섹션 -->
        <div class="border-b border-slate-800 pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <span class="text-xs text-sky-400 font-mono font-bold uppercase tracking-wider">BIOFORM AI TECHNICAL DOSSIER</span>
            <h1 class="text-2xl font-black text-white mt-1">${proj.name}</h1>
            <div class="text-xs text-slate-400 mt-1">발행일: ${now} | 연구 시스템: BIOFORM AI Research Suite v2.5</div>
          </div>
          <div class="text-right">
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              ${proj.status === 'completed' ? 'RESEARCH COMPLETED' : 'IN-SILICO VALIDATED'}
            </span>
          </div>
        </div>

        <!-- 1. 프로젝트 기본 정보 및 연구 목적 -->
        <div>
          <h3 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">1. 프로젝트 기본 정보 및 연구 목적</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
            <div class="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
              <span class="text-slate-400 block text-[10px]">연구 목적</span>
              <span class="font-medium text-slate-200 leading-relaxed">${proj.purpose}</span>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-800/40 border border-slate-800">
              <span class="text-slate-400 block text-[10px]">대상 약물 및 봉입량</span>
              <span class="font-bold text-sky-300">${proj.targetDrug} (${proj.drugLoading} wt%)</span>
            </div>
          </div>
          <p class="text-xs text-slate-400 leading-relaxed">${proj.description}</p>
        </div>

        <!-- 2. 복합재료 조성 및 가교 조건 -->
        <div>
          <h3 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">2. 복합 생체재료 배합 조성</h3>
          <table class="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden mb-3">
            <thead class="bg-slate-800 text-slate-400 uppercase text-[10px]">
              <tr>
                <th class="p-2.5">구성 재료</th>
                <th class="p-2.5">배합 비율</th>
                <th class="p-2.5">카테고리</th>
                <th class="p-2.5">주요 역할</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800 text-slate-300">
              ${proj.materials.map(m => {
                const dbMat = BIOMATERIALS_DB.find(x => x.id === m.id);
                return `
                  <tr>
                    <td class="p-2.5 font-bold text-white">${dbMat ? dbMat.nameKo : m.id} (${dbMat ? dbMat.abbr : ''})</td>
                    <td class="p-2.5 font-mono text-sky-400 font-bold">${m.ratio} wt%</td>
                    <td class="p-2.5 text-slate-400">${dbMat ? dbMat.categoryKo : ''}</td>
                    <td class="p-2.5 text-slate-400">${dbMat ? dbMat.drugDeliveryRole : ''}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
          <div class="text-[11px] text-slate-400 font-mono">가교제: ${proj.crosslinker} (${proj.crosslinkerDensity} wt%) | 평가 조건: pH ${proj.phCondition}, ${proj.tempCondition}℃</div>
        </div>

        <!-- 3. 재료 간 상호작용 분석 결과 -->
        <div>
          <h3 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">3. 재료 간 상호작용 분석 결과 (Intermolecular Interactions)</h3>
          <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs space-y-2">
            <div class="flex justify-between items-center text-slate-300">
              <span class="font-bold text-white">분자 상용성 지수 (Compatibility Score):</span>
              <span class="font-mono text-sky-400 font-bold text-sm">${inter.compatibilityScore} / 100</span>
            </div>
            <p class="text-slate-300 leading-relaxed">${inter.summaryText}</p>
            <div class="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
              ${inter.interactions.map(item => `
                <div><strong>• ${item.type.split('(')[0]}:</strong> ${item.strength} (${item.score}점)</div>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- 4. 물성 예측 및 약물 방출 시뮬레이션 지표 -->
        <div>
          <h3 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">4. 인실리코 물성 및 약물 방출 시뮬레이션</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
            <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
              <span class="text-slate-400 text-[10px] block">탄성계수 (E)</span>
              <span class="text-lg font-bold text-white font-mono">${props.elasticModulusKPa} kPa</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
              <span class="text-slate-400 text-[10px] block">평형 팽윤율 (Q)</span>
              <span class="text-lg font-bold text-sky-400 font-mono">${props.swellingRatioPercent}%</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
              <span class="text-slate-400 text-[10px] block">24h 누적 방출률</span>
              <span class="text-lg font-bold text-emerald-400 font-mono">${sim.release24h}%</span>
            </div>
            <div class="p-3 rounded-xl bg-slate-800/60 border border-slate-800">
              <span class="text-slate-400 text-[10px] block">생체적합성 점수</span>
              <span class="text-lg font-bold text-indigo-400 font-mono">${props.biocompatibilityScore} / 100</span>
            </div>
          </div>

          <!-- 실제 차트 캔버스 렌더링 -->
          <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-800">
            <div class="text-xs font-semibold text-slate-300 mb-2">약물 방출 키네틱 곡선 (Korsmeyer-Peppas n = ${sim.nExponent})</div>
            <div class="w-full h-56 relative">
              <canvas id="chart-report-release-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- 5. 역설계 및 최적 후보 순위 결과 -->
        <div>
          <h3 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">5. 목표 역설계 및 최적화 채택 결과</h3>
          <div class="p-4 rounded-xl bg-slate-800/40 border border-slate-800 text-xs space-y-2">
            ${optCand ? `
              <div class="flex justify-between items-center text-slate-200">
                <span class="font-bold text-sky-300">최종 채택 최적 후보: ${optCand.name}</span>
                <span class="font-mono font-bold text-emerald-400">종합 만족도: ${optCand.overallScore}점</span>
              </div>
            ` : invCand ? `
              <div class="flex justify-between items-center text-slate-200">
                <span class="font-bold text-sky-300">역설계 채택 후보: ${invCand.name}</span>
                <span class="font-mono font-bold text-sky-400">목표 일치도: ${invCand.matchScore}%</span>
              </div>
            ` : `
              <div class="text-slate-300">현재 조성 설계안이 기본 최적화 기준을 충족하고 있습니다.</div>
            `}
            <p class="text-slate-400 text-[11px] leading-relaxed">
              Korsmeyer-Peppas 비픽 확산 지배 메커니즘을 통해 초기 버스트 방출을 통제하고, 80% 이상의 약물 방출이 지속되는 최적의 가교 밀도를 확보하였습니다.
            </p>
          </div>
        </div>

        <!-- 6. AI 분석 근거 및 후속 검증 계획 -->
        <div>
          <h3 class="text-sm font-bold text-sky-400 uppercase tracking-wider mb-2">6. AI 분석 근거 및 후속 검증 계획</h3>
          <p class="text-xs text-slate-300 leading-relaxed mb-3">${xai.recommendationReason}</p>
          
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
              <thead class="bg-slate-800 text-slate-400 uppercase text-[10px]">
                <tr>
                  <th class="p-2.5">실험군</th>
                  <th class="p-2.5">배합 조성</th>
                  <th class="p-2.5">가교 조건</th>
                  <th class="p-2.5">검증 프로토콜</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800 text-slate-300 text-[11px]">
                ${protocol.runs.slice(0, 4).map(r => `
                  <tr>
                    <td class="p-2.5 font-bold text-sky-400">${r.id}</td>
                    <td class="p-2.5">${r.compositionDesc}</td>
                    <td class="p-2.5 font-mono text-amber-300">${r.crosslinkerDesc}</td>
                    <td class="p-2.5 text-slate-400">${r.expectedOutcome}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      this.initReportReleaseChart(sim);
    }, 50);
  },

  initReportReleaseChart(sim) {
    const ctx = document.getElementById("chart-report-release-canvas");
    if (!ctx) return;

    if (this.charts.reportRelease) {
      this.charts.reportRelease.destroy();
    }

    this.charts.reportRelease = new Chart(ctx, {
      type: "line",
      data: {
        labels: sim.timePoints.map(t => `${t}h`),
        datasets: [{
          label: "누적 약물 방출률 (%)",
          data: sim.cumulativeRelease,
          borderColor: "#38BDF8",
          backgroundColor: "rgba(56, 189, 248, 0.2)",
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: "#38BDF8"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: "#1E293B" },
            ticks: { color: "#94A3B8", font: { size: 10 } }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: "#1E293B" },
            ticks: {
              color: "#94A3B8",
              font: { size: 10 },
              callback: (v) => `${v}%`
            }
          }
        }
      }
    });
  },

  downloadReportMarkdown() {
    const proj = this.getActiveProject();
    const props = proj.simulationResults?.props || PhysicsEngine.calculateCompositeProperties(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition });
    const sim = proj.simulationResults?.sim || PhysicsEngine.simulateDrugRelease(proj.materials, proj.crosslinker, proj.crosslinkerDensity, { ph: proj.phCondition, drugLoading: proj.drugLoading });
    const inter = proj.interactionAnalysis || PhysicsEngine.analyzeMaterialInteraction(proj.materials[0]?.id || "alginate", proj.materials[1]?.id || "chitosan");
    const protocol = proj.experimentProtocol || PhysicsEngine.generateDynamicExperimentProtocol(proj);

    const compStr = proj.materials.map(m => {
      const dbMat = BIOMATERIALS_DB.find(x => x.id === m.id);
      return `- **${dbMat ? dbMat.nameKo : m.id}**: ${m.ratio} wt%`;
    }).join("\n");

    const runsStr = protocol.runs.map(r => `- **${r.id} (${r.label})**: ${r.compositionDesc} | ${r.crosslinkerDesc} (${r.expectedOutcome})`).join("\n");

    const content = `# [BIOFORM AI] 종합 연구 보고서
**과제명**: ${proj.name}
**연구 목적**: ${proj.purpose}
**대상 약물**: ${proj.targetDrug} (${proj.drugLoading} wt%)
**발행일자**: ${new Date().toISOString().split("T")[0]}
**진행 상태**: ${proj.status === 'completed' ? '연구 완료 (Completed)' : '진행중 (In-Progress)'}

---

## 1. 복합 생체재료 배합 조성
${compStr}
- **가교제**: ${proj.crosslinker} (${proj.crosslinkerDensity} wt%)
- **환경 조건**: pH ${proj.phCondition}, ${proj.tempCondition}℃

## 2. 재료 간 상호작용 분석 결과
- **분자 상용성 지수**: ${inter.compatibilityScore} / 100
- **상호작용 평가**: ${inter.summaryText}

## 3. 인실리코 물성 및 방출 예측 결과
- **탄성계수(E)**: ${props.elasticModulusKPa} kPa
- **인장강도(UTS)**: ${props.tensileStrengthMPa} MPa
- **평형 팽윤율(Q)**: ${props.swellingRatioPercent}%
- **24시간 누적 약물 방출률**: ${sim.release24h}%
- **초기 1시간 방출 속도**: ${sim.initialBurstRate}% / h
- **약물 방출 지속시간(t80)**: ${sim.sustainedDurationHours}시간
- **생체적합성 지표**: ${props.biocompatibilityScore} / 100
- **생분해 지속기간**: 약 ${props.biodegradationDays}일

## 4. 후속 실험 설계 (Experimental Protocol)
**연구 주제**: ${protocol.topic}
**실험 가설**: ${protocol.hypothesis}

### 실험군 구성:
${runsStr}

### 분석 장비 및 SOP:
1. FT-IR 분광분석기 (특이 피크 이동 및 PEC 결합 형성 확인)
2. 회전형 레오미터 (저장 탄성률 G' > 손실 탄성률 G'' 겔화 판정)
3. USP II 패들 용출 시험 (시간별 누적 방출 속도 실측)
`;

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BIOFORM_Dossier_${proj.id}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast("종합 연구 보고서 Markdown 파일이 다운로드되었습니다.");
  },

  showToast(msg) {
    const toast = document.getElementById("ui-toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove("opacity-0", "translate-y-4");
    toast.classList.add("opacity-100", "translate-y-0");
    setTimeout(() => {
      toast.classList.remove("opacity-100", "translate-y-0");
      toast.classList.add("opacity-0", "translate-y-4");
    }, 3200);
  }
};

if (typeof window !== "undefined") {
  window.UI = UI;
}
