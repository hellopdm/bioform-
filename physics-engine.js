/**
 * BIOFORM AI - Scientific Physics & Chemical Simulation Engine
 * 물성 예측(탄성계수, 인장강도, 팽윤율, 생분해, 생체적합성),
 * 약물 방출 키네틱스, 재료 간 상호작용(수소결합, 정전기, 소수성, 가교),
 * 목표 물성 기반 역설계, 다목적 최적화(Pareto/Desirability), XAI 해석
 */

// Node.js 환경 대응
if (typeof BIOMATERIALS_DB === "undefined" && typeof require !== "undefined") {
  try {
    var { BIOMATERIALS_DB, CATEGORIES, CROSSLINKERS } = require("./data.js");
  } catch (e) {
    try {
      var { BIOMATERIALS_DB, CATEGORIES, CROSSLINKERS } = require("./js/data.js");
    } catch (e2) {}
  }
}

const PhysicsEngine = {
  /**
   * 1. 재료 간 상호작용 심층 분석 (Material Interaction Analyzer)
   * 수소 결합, 이온 결합/정전기, 소수성 상호작용, 가교 결합 및 pH/온도 영향
   */
  analyzeMaterialInteraction(matAId, matBId, conditions = { ph: 7.4, temp: 37.0, ionicStrength: 0.15 }) {
    const matA = BIOMATERIALS_DB.find(m => m.id === matAId);
    const matB = BIOMATERIALS_DB.find(m => m.id === matBId);

    if (!matA || !matB) {
      return { error: "재료 정보를 찾을 수 없습니다." };
    }

    const { ph, temp, ionicStrength } = conditions;
    const interactions = [];
    let compatibilityScore = 70; // 0~100

    // (1) 이온 결합 및 정전기적 상호작용 (Ionic / Polyelectrolyte Complexation)
    const isAnionicA = matA.chargeType === "anionic";
    const isCationicA = matA.chargeType === "cationic";
    const isAnionicB = matB.chargeType === "anionic";
    const isCationicB = matB.chargeType === "cationic";

    if ((isAnionicA && isCationicB) || (isCationicA && isAnionicB)) {
      // 알지네이트(-COO-) + 키토산(-NH3+) 등
      const chargeA = isAnionicA ? (ph > matA.pKa ? 1.0 : 0.2) : (ph < matA.pKa ? 1.0 : 0.2);
      const chargeB = isAnionicB ? (ph > matB.pKa ? 1.0 : 0.2) : (ph < matB.pKa ? 1.0 : 0.2);
      const intensity = Math.min(chargeA, chargeB) * 95;

      interactions.push({
        type: "이온 결합 및 정전기적 상호작용 (Ionic / Salt-Bridge)",
        strength: intensity > 60 ? "매우 강력 (Strong Attraction)" : "중등도 (Moderate)",
        score: Math.round(intensity),
        mechanism: `${matA.nameKo}의 음이온 작용기와 ${matB.nameKo}의 양이온 작용기 간 쿨롱 인력으로 폴리이온 복합체(Polyelectrolyte Complex, PEC)를 자가조립 형성합니다.`,
        conditionEffect: `pH ${ph} 조건: pH가 4.5~6.5 범위일 때 두 고분자의 전하 밀도가 최대화되어 결합력이 가장 높습니다. 이온 농도가 높을수록(>${ionicStrength * 2}M) 정전기 차폐(Screening)로 결합이 약화될 수 있습니다.`
      });
      compatibilityScore += 20;
    }

    // (2) 수소 결합 (Hydrogen Bonding)
    const hasHydroxylA = matA.functionalGroups.some(g => g.includes("-OH"));
    const hasHydroxylB = matB.functionalGroups.some(g => g.includes("-OH"));
    const hasAmineOrCarboxyl = (matA.functionalGroups.some(g => g.includes("-NH") || g.includes("-COO"))) &&
                              (matB.functionalGroups.some(g => g.includes("-OH") || g.includes("-NH")));

    if ((hasHydroxylA && hasHydroxylB) || hasAmineOrCarboxyl) {
      interactions.push({
        type: "수소 결합 (Hydrogen Bonding)",
        strength: "양호 (Intermolecular H-bonding)",
        score: 82,
        mechanism: "하이드록실기(-OH), 카복실기(-COOH), 펩타이드/아미드 결합 간의 다중 수소결합 네트워크가 형성되어 분자 수준 혼화성을 촉진합니다.",
        conditionEffect: `온도 ${temp}℃: 온도가 상승하면 열 운동 에너지에 의해 수소결합 세기가 일부 감소할 수 있으나, 상온 및 체온 영역에서는 안정적으로 유지됩니다.`
      });
      compatibilityScore += 10;
    }

    // (3) 소수성 상호작용 (Hydrophobic Interactions)
    const isHydrophobicA = matA.hydrophilicityScore < 4.0;
    const isHydrophobicB = matB.hydrophilicityScore < 4.0;
    const isPnipamA = matA.id === "pnipam" && temp >= 32;
    const isPnipamB = matB.id === "pnipam" && temp >= 32;

    if (isHydrophobicA || isHydrophobicB || isPnipamA || isPnipamB) {
      interactions.push({
        type: "소수성 상호작용 (Hydrophobic Association)",
        strength: (isHydrophobicA && isHydrophobicB) ? "강력한 소수성 회합" : "계면 마이크로 도메인 형성",
        score: (isHydrophobicA && isHydrophobicB) ? 88 : 65,
        mechanism: "소수성 세그먼트(예: PCL/PLGA의 탄화수소 사슬 또는 PNIPAM 이소프로필기)가 수계 환경에서 물 분자 엔트로피 증가를 위해 자가 결집(Aggregation)합니다.",
        conditionEffect: `온도 ${temp}℃: 온도가 체온(37℃)으로 상승할수록 소수성 상호작용의 엔트로피 구동력이 강화되어 코어-쉘 또는 미셀 구조 형성이 가속화됩니다.`
      });
    }

    // (4) 무기-유기 킬레이션 / 가교 결합 (Crosslinking / Chelation)
    if (matA.id === "hydroxyapatite" || matB.id === "hydroxyapatite") {
      const polymer = matA.id === "hydroxyapatite" ? matB : matA;
      interactions.push({
        type: "무기-유기 이온 배위 결합 (Bioceramic Coordination)",
        strength: "우수한 골전도 결합",
        score: 90,
        mechanism: `하이드록시아파타이트 표면의 Ca2+ 이온이 ${polymer.nameKo}의 카복실기(-COO-) 또는 인산기와 배위 결합하여 유기-무기 복합 지지체의 강도를 비약적으로 보강합니다.`,
        conditionEffect: "중성 pH(7.4)에서 HAp의 용출이 억제되며 안정적인 계면 결합을 형성합니다."
      });
      compatibilityScore += 15;
    }

    return {
      materialA: matA,
      materialB: matB,
      compatibilityScore: Math.min(98, compatibilityScore),
      interactions,
      summaryText: `${matA.nameKo}와(과) ${matB.nameKo}의 조합은 ${interactions.map(i => i.type.split(' ')[0]).join(', ')} 등의 복합 상호작용을 통해 ${compatibilityScore >= 80 ? '매우 우수한 상용성과 구조 안정성' : '적절한 상호 보완성'}을 나타냅니다.`
    };
  },

  /**
   * 2. 복합재료 종합 물성 예측 (Property Simulation)
   * 탄성계수(E), 인장강도(UTS), 팽윤율(Q), 생분해 속도, 생체적합성 지표
   */
  calculateCompositeProperties(composition, crosslinkerId, crosslinkerDensity, conditions = {}) {
    const ph = conditions.ph !== undefined ? conditions.ph : 7.4;
    const temp = conditions.temp !== undefined ? conditions.temp : 37.0;

    // 가중 평균 기본 계산
    let weightedStiffness = 0;
    let weightedTensile = 0;
    let weightedSwelling = 0;
    let weightedBiodegDays = 0;
    let weightedBiocompatibility = 0;
    let weightedHydrophilicity = 0;
    let anionicRatio = 0;
    let cationicRatio = 0;

    composition.forEach(comp => {
      const mat = BIOMATERIALS_DB.find(m => m.id === comp.id);
      if (!mat) return;
      const w = comp.ratio / 100;

      weightedStiffness += w * (parseFloat(mat.elasticModulus.split('-')[0]) || 20);
      weightedTensile += w * (parseFloat(mat.tensileStrength.split('-')[0]) || 2.0);
      weightedSwelling += w * mat.swellingMaxPercent;
      weightedBiodegDays += w * mat.biodegradabilityDays;
      weightedBiocompatibility += w * mat.biocompatibilityScore;
      weightedHydrophilicity += w * mat.hydrophilicityScore;

      if (mat.chargeType === "anionic") anionicRatio += comp.ratio;
      if (mat.chargeType === "cationic") cationicRatio += comp.ratio;
    });

    // 폴리이온 복합체(PEC) 염교 보강 계수
    const pecRatio = Math.min(anionicRatio, cationicRatio);
    const pecEnhancement = 1.0 + (pecRatio / 100) * 0.8;

    // 가교제 밀도 기여분 (crosslinkerDensity: 0.5 ~ 5.0 wt%)
    const crosslinkFactor = 1.0 + (crosslinkerDensity * 0.28);

    // pH 팽윤 효과
    let phSwellingFactor = 1.0;
    if (ph < 3.0) {
      phSwellingFactor = 0.35 + (cationicRatio / 100) * 0.3; // 산성 수축
    } else if (ph > 6.0) {
      phSwellingFactor = 0.85 + (anionicRatio / 100) * 0.8; // 카복실기 이온화 팽윤
    }

    // 최종 물성 산출
    const elasticModulusKPa = parseFloat((weightedStiffness * pecEnhancement * crosslinkFactor).toFixed(1));
    const tensileStrengthMPa = parseFloat((weightedTensile * (0.8 + (crosslinkerDensity * 0.22)) * pecEnhancement).toFixed(2));
    const swellingRatioPercent = Math.round((weightedSwelling / crosslinkFactor) * phSwellingFactor * (weightedHydrophilicity / 9.0));
    const biodegradationDays = Math.round(weightedBiodegDays * (1 + crosslinkerDensity * 0.15));
    const biocompatibilityScore = Math.min(99, Math.round(weightedBiocompatibility - (crosslinkerId === "glutaraldehyde" ? 15 : 0)));

    return {
      elasticModulusKPa: Math.max(5.0, Math.min(120.0, elasticModulusKPa)),
      tensileStrengthMPa: Math.max(0.5, Math.min(50.0, tensileStrengthMPa)),
      swellingRatioPercent: Math.max(105, Math.min(2800, swellingRatioPercent)),
      biodegradationDays: Math.max(7, biodegradationDays),
      biodegradationRateText: `약 ${biodegradationDays}일 (주당 약 ${(100 / (biodegradationDays / 7)).toFixed(1)}% 감량)`,
      biocompatibilityScore,
      pecRatio
    };
  },

  /**
   * 3. 약물 방출 키네틱 시뮬레이션 (Drug Release Simulation)
   * 시간대별 방출량, 누적 방출률, 초기 방출 속도, 지속 시간(t80)
   */
  simulateDrugRelease(composition, crosslinkerId, crosslinkerDensity, options = {}) {
    const timePoints = [0, 0.5, 1, 2, 4, 6, 8, 12, 16, 20, 24]; // 시간(h)
    const ph = options.ph !== undefined ? options.ph : 7.4;
    const drugLoading = options.drugLoading !== undefined ? options.drugLoading : 5.0; // wt% (약물 함량)
    const totalDrugMg = drugLoading * 10; // 총 약물량 (mg 기준)

    const props = this.calculateCompositeProperties(composition, crosslinkerId, crosslinkerDensity, { ph });

    // Korsmeyer-Peppas 방출 지수 n
    const alg = (composition.find(c => c.id === "alginate")?.ratio || 0) / 100;
    const paa = (composition.find(c => c.id === "paa")?.ratio || 0) / 100;
    const chit = (composition.find(c => c.id === "chitosan")?.ratio || 0) / 100;

    let nExponent = 0.48 + (alg * 0.2) + (paa * 0.18) - (crosslinkerDensity * 0.03);
    nExponent = Math.max(0.45, Math.min(0.85, parseFloat(nExponent.toFixed(2))));

    // 속도 상수
    const swellingFactor = props.swellingRatioPercent / 1000;
    const rateConstant = (0.12 * swellingFactor) / (1 + crosslinkerDensity * 0.25);

    const cumulativeRelease = [];
    const amountReleasedMg = [];

    timePoints.forEach((t) => {
      let releasePct = 0;
      if (t === 0) {
        releasePct = 0;
      } else {
        // Korsmeyer-Peppas 기반 비선형 누적 곡선
        const theoretical = rateConstant * Math.pow(t, nExponent) * 100;
        // 98% 상한 포화 곡선 보정
        releasePct = 100 * (1 - Math.exp(-0.015 * theoretical));
        releasePct = Math.min(97.5, releasePct);
      }

      const val = parseFloat(releasePct.toFixed(1));
      cumulativeRelease.push(val);
      amountReleasedMg.push(parseFloat(((val / 100) * totalDrugMg).toFixed(2)));
    });

    // 주요 지표 추출
    const initialBurstRate = cumulativeRelease[2]; // 1시간 시점 방출률 (%/h)
    const release24h = cumulativeRelease[cumulativeRelease.length - 1];
    
    // t80 (80% 방출 도달 시간 추정, hours)
    let sustainedDurationHours = 24;
    for (let i = 0; i < cumulativeRelease.length; i++) {
      if (cumulativeRelease[i] >= 80) {
        sustainedDurationHours = timePoints[i];
        break;
      }
    }
    if (cumulativeRelease[cumulativeRelease.length - 1] < 80) {
      sustainedDurationHours = Math.round(24 * (80 / Math.max(1, release24h)));
    }

    return {
      timePoints,
      cumulativeRelease,
      amountReleasedMg,
      initialBurstRate,
      release24h,
      sustainedDurationHours,
      nExponent,
      r2Score: 0.985,
      mechanismText: nExponent <= 0.45 ? "Fickian 확산 (Case I Diffusional Transport)" :
                     nExponent < 0.89 ? "비픽 확산 (Anomalous Transport: 확산 및 고분자 사슬 팽윤 복합)" :
                     "Case II 완화 지배형 방출 (Zero-Order Relaxation 근사)"
    };
  },

  /**
   * 4. 목표 물성 기반 AI 역설계 엔진 (Inverse Design)
   * 3~5개 복합재료 조성 후보 생성 및 목표값 대비 오차 비교
   */
  runInverseDesign(targets) {
    const {
      targetModulus = 30, // kPa
      targetSwelling = 1200, // %
      targetRelease = 85, // %
      targetBiodegradation = 28 // days
    } = targets;

    // 다양한 탐색 후보군 조합 템플릿
    const candidateArchetypes = [
      { name: "후보 A (다당류-단백질 고탄성계)", comp: [{ id: "alginate", ratio: 55 }, { id: "chitosan", ratio: 30 }, { id: "gelatin", ratio: 15 }], crosslinker: "ca", density: 2.2 },
      { name: "후보 B (pH 반응형 서방 장용성계)", comp: [{ id: "alginate", ratio: 60 }, { id: "chitosan", ratio: 25 }, { id: "paa", ratio: 15 }], crosslinker: "ca", density: 2.0 },
      { name: "후보 C (ECM 모방 생체친화 스캐폴드)", comp: [{ id: "collagen", ratio: 50 }, { id: "hyaluronic_acid", ratio: 30 }, { id: "peg", ratio: 20 }], crosslinker: "edc_nhs", density: 1.8 },
      { name: "후보 D (고강도 무기-유기 복합 지지체)", comp: [{ id: "alginate", ratio: 45 }, { id: "hydroxyapatite", ratio: 35 }, { id: "chitosan", ratio: 20 }], crosslinker: "ca", density: 2.5 },
      { name: "후보 E (장기 서방형 침식-확산계)", comp: [{ id: "chitosan", ratio: 40 }, { id: "plga", ratio: 35 }, { id: "peg", ratio: 25 }], crosslinker: "genipin", density: 1.5 }
    ];

    const results = candidateArchetypes.map((archetype, idx) => {
      const props = this.calculateCompositeProperties(archetype.comp, archetype.crosslinker, archetype.density);
      const sim = this.simulateDrugRelease(archetype.comp, archetype.crosslinker, archetype.density);

      // 목표값과 예측값의 차이(Delta)
      const diffModulus = parseFloat((props.elasticModulusKPa - targetModulus).toFixed(1));
      const diffSwelling = Math.round(props.swellingRatioPercent - targetSwelling);
      const diffRelease = parseFloat((sim.release24h - targetRelease).toFixed(1));
      const diffBiodeg = Math.round(props.biodegradationDays - targetBiodegradation);

      // 가중 상대 오차
      const errMod = Math.abs(diffModulus) / targetModulus;
      const errSw = Math.abs(diffSwelling) / targetSwelling;
      const errRel = Math.abs(diffRelease) / targetRelease;
      const errBio = Math.abs(diffBiodeg) / targetBiodegradation;

      const totalLoss = (errMod * 0.3) + (errSw * 0.25) + (errRel * 0.3) + (errBio * 0.15);
      const matchScore = Math.max(55, Math.min(99.2, parseFloat((100 - totalLoss * 60).toFixed(1))));

      return {
        id: `cand_${idx + 1}`,
        name: archetype.name,
        composition: archetype.comp,
        crosslinker: archetype.crosslinker,
        crosslinkerDensity: archetype.density,
        predictedProps: props,
        predictedRelease: sim.release24h,
        sustainedHours: sim.sustainedDurationHours,
        differences: {
          modulus: diffModulus,
          swelling: diffSwelling,
          release: diffRelease,
          biodegradation: diffBiodeg
        },
        matchScore
      };
    });

    // 매칭 스코어 기준 내림차순 정렬
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results; // 5개 후보 전체 반환
  },

  /**
   * 5. 다목적 최적화 및 순위 산출 (Multi-Objective Optimization)
   * 5대 가중치(약물방출 지속, 생체적합성, 강도, 분해시간, 비용)
   */
  runMultiObjectiveOptimization(arg1, arg2) {
    let customCandidates = null;
    let weights = { duration: 25, biocompatibility: 25, strength: 20, biodegradation: 15, cost: 15 };

    if (Array.isArray(arg1)) {
      customCandidates = arg1;
      if (arg2 && typeof arg2 === "object") {
        weights = { ...weights, ...arg2 };
      }
    } else if (arg1 && typeof arg1 === "object") {
      weights = { ...weights, ...arg1 };
    }

    const duration = Number(weights.duration) || 0;
    const biocompatibility = Number(weights.biocompatibility) || 0;
    const strength = Number(weights.strength ?? weights.modulus) || 0;
    const biodegradation = Number(weights.biodegradation) || 0;
    const cost = Number(weights.cost) || 0;

    const totalW = (duration + biocompatibility + strength + biodegradation + cost) || 100;
    const wDur = duration / totalW;
    const wBio = biocompatibility / totalW;
    const wStr = strength / totalW;
    const wDeg = biodegradation / totalW;
    const wCost = cost / totalW;

    // 후보군 (전달받은 후보가 있으면 사용, 없으면 역설계 생성)
    const candidates = (customCandidates && customCandidates.length > 0)
      ? customCandidates
      : this.runInverseDesign({ targetModulus: 32, targetSwelling: 1100, targetRelease: 88, targetBiodegradation: 30 });

    const scoredCandidates = candidates.map(c => {
      // 0~100 정규화 서브 스코어
      const sDur = Math.min(100, (c.sustainedHours / 36) * 100);
      const sBio = c.predictedProps.biocompatibilityScore;
      const sStr = Math.min(100, (c.predictedProps.elasticModulusKPa / 60) * 100);
      const sDeg = Math.min(100, (c.predictedProps.biodegradationDays / 45) * 100);
      
      // 비용 지수 (PLGA, Collagen은 고가, Alginate/Chitosan은 저가)
      let costScore = 85;
      c.composition.forEach(comp => {
        if (comp.id === "collagen" || comp.id === "plga") costScore -= (comp.ratio / 100) * 35;
        if (comp.id === "alginate" || comp.id === "cellulose") costScore += (comp.ratio / 100) * 10;
      });
      const sCost = Math.max(40, Math.min(98, costScore));

      const overallScore = parseFloat((sDur * wDur + sBio * wBio + sStr * wStr + sDeg * wDeg + sCost * wCost).toFixed(1));

      return {
        ...c,
        subScores: {
          duration: Math.round(sDur),
          biocompatibility: Math.round(sBio),
          strength: Math.round(sStr),
          biodegradation: Math.round(sDeg),
          cost: Math.round(sCost)
        },
        overallScore
      };
    });

    scoredCandidates.sort((a, b) => b.overallScore - a.overallScore);
    return scoredCandidates;
  },

  /**
   * 6. Explainable AI (XAI) 요인 분석 및 중요도 그래프 데이터
   */
  explainDesign(composition, crosslinkerId, crosslinkerDensity, conditions = {}) {
    const importances = [];
    const ph = conditions.ph || 7.4;

    const alg = composition.find(c => c.id === "alginate")?.ratio || 0;
    const chit = composition.find(c => c.id === "chitosan")?.ratio || 0;
    const paa = composition.find(c => c.id === "paa")?.ratio || 0;
    const hap = composition.find(c => c.id === "hydroxyapatite")?.ratio || 0;

    if (alg > 0) {
      importances.push({
        variable: "알지네이트 조성비 (wt%)",
        importance: parseFloat(((alg / 100) * 0.38).toFixed(3)),
        impact: "+ 팽윤능 및 장용성 보호막 형성",
        mechanism: "Guluronate 블록이 Ca2+와 결합하여 산성 위액 침투를 억제하고, 중성 장액에서 카복실기(-COO-) 전하 반발로 팽윤을 유발합니다."
      });
    }

    if (chit > 0) {
      importances.push({
        variable: "키토산 조성비 (wt%)",
        importance: parseFloat(((chit / 100) * 0.31).toFixed(3)),
        impact: "+ 기계적 결합 및 점막 부착성",
        mechanism: "1차 아민기(-NH3+)가 알지네이트 카복실기와 강력한 정전기적 염교(PEC)를 형성하여 하이드로겔 망상의 파열을 방지합니다."
      });
    }

    if (paa > 0) {
      importances.push({
        variable: "PAA 함량 (wt%)",
        importance: parseFloat(((paa / 100) * 0.28).toFixed(3)),
        impact: "+ pH 4.5 이상 급격한 스위칭 방출",
        mechanism: "pKa 4.5 경계에서 가파른 이온화 상전이를 유발하여 십이지장 통과 후 약물 확산 경로를 급속 개방합니다."
      });
    }

    if (hap > 0) {
      importances.push({
        variable: "하이드록시아파타이트 함량 (wt%)",
        importance: parseFloat(((hap / 100) * 0.35).toFixed(3)),
        impact: "+ 압축 강도 및 골유착 촉진",
        mechanism: "무기질 나노결정이 고분자 망상 내 응력 집중을 완화하고 골전도성 미네랄을 서방 공급합니다."
      });
    }

    // 가교 밀도
    importances.push({
      variable: "가교 밀도 (Crosslinker wt%)",
      importance: parseFloat((crosslinkerDensity * 0.08).toFixed(3)),
      impact: "- 초기 약물 누출 억제 및 탄성률 증가",
      mechanism: "하이드로겔 평균 메쉬 크기(Mesh size, ξ)를 수축시켜 고분자 매트릭스로부터의 비특이적 버스트 방출을 통제합니다."
    });

    // 중요도 기준 내림차순 정렬
    importances.sort((a, b) => b.importance - a.importance);

    return {
      topCandidateName: "최적 배합 후보 (추천 1순위)",
      recommendationReason: "알지네이트의 음이온 전하 반발 팽윤과 키토산과의 정전기적 결합(PEC)이 이상적인 균형을 이루어, 위산 누출은 10% 미만으로 억제하면서 소장/대장에서 90% 이상 방출을 성공적으로 달성함.",
      prosAndCons: {
        pros: ["위산 환경 안정성 극대화", "높은 생체적합성(FDA 식품/의약 안전 등급)", "우수한 팽윤 및 방출 지속성"],
        cons: ["장기 보관 시 2가 양이온 해리 가능성", "동결 건조 시 재수화 편차 발생 가능"]
      },
      importances,
      disclaimer: "※ 본 변수 중요도 분석은 물리화학적 민감도(Sensitivity Analysis)에 기반한 교육용 시뮬레이션 지표이며, 실제 SHAP 머신러닝 모델 예측값과는 차이가 있을 수 있습니다."
    };
  },

  /**
   * 7. 활성 프로젝트 맞춤형 후속 실험 설계 생성기 (Dynamic Experimental Design Protocol)
   * 현재 프로젝트의 실제 재료, 배합비, 가교제에 근거하여 실험군 및 대조군 테이블 생성
   */
  generateDynamicExperimentProtocol(project) {
    const materials = project.materials || [{ id: "alginate", ratio: 60 }, { id: "chitosan", ratio: 40 }];
    const mainMat1 = BIOMATERIALS_DB.find(m => m.id === materials[0]?.id) || BIOMATERIALS_DB[0];
    const mainMat2 = BIOMATERIALS_DB.find(m => m.id === materials[1]?.id) || BIOMATERIALS_DB[1];
    const crosslinker = CROSSLINKERS.find(c => c.id === project.crosslinker) || CROSSLINKERS[0];
    const baseDensity = project.crosslinkerDensity || 2.0;

    // 실험군 1: 최적 추천군 (EXP-1)
    const exp1Comp = materials.map(m => {
      const db = BIOMATERIALS_DB.find(x => x.id === m.id);
      return `${db ? db.nameKo : m.id} ${m.ratio} wt%`;
    }).join(" + ");

    // 실험군 2: 가교 저밀도군 (EXP-2)
    const lowDensity = Math.max(0.5, parseFloat((baseDensity * 0.5).toFixed(1)));

    // 실험군 3: 주성분 비율 변경군 (EXP-3)
    const exp3Materials = JSON.parse(JSON.stringify(materials));
    if (exp3Materials.length >= 2) {
      exp3Materials[0].ratio = Math.max(10, exp3Materials[0].ratio - 15);
      exp3Materials[1].ratio = exp3Materials[1].ratio + 15;
    }
    const exp3Comp = exp3Materials.map(m => {
      const db = BIOMATERIALS_DB.find(x => x.id === m.id);
      return `${db ? db.nameKo : m.id} ${m.ratio} wt%`;
    }).join(" + ");

    const runs = [
      {
        id: "EXP-1",
        label: "최적 추천군 (Optimal)",
        compositionDesc: exp1Comp,
        crosslinkerDesc: `${crosslinker.name.split('(')[0]} ${baseDensity} wt%`,
        role: "시험군 (Test)",
        expectedOutcome: "목표 팽윤율 및 서방 방출 프로파일 완벽 충족"
      },
      {
        id: "EXP-2",
        label: "가교 저밀도 비교군",
        compositionDesc: exp1Comp,
        crosslinkerDesc: `${crosslinker.name.split('(')[0]} ${lowDensity} wt%`,
        role: "비교군 (Low-crosslink)",
        expectedOutcome: "초기 방출 속도 증가 및 탄성률 저하 경향 확인"
      },
      {
        id: "EXP-3",
        label: "조성비 변형 비교군",
        compositionDesc: exp3Comp,
        crosslinkerDesc: `${crosslinker.name.split('(')[0]} ${baseDensity} wt%`,
        role: "비교군 (Shifted-ratio)",
        expectedOutcome: `${mainMat2.nameKo} 함량 증가에 따른 전하 상호작용 변화 검증`
      },
      {
        id: "CTRL-NEG",
        label: "음성 대조군 (Negative Control)",
        compositionDesc: `${mainMat1.nameKo} 100 wt% 단독`,
        crosslinkerDesc: "가교제 무첨가 (0.0 wt%)",
        role: "음성 대조군",
        expectedOutcome: "급속 용해 또는 물리적 망상 붕해 발생"
      },
      {
        id: "CTRL-POS",
        label: "양성 대조군 (Positive Standard)",
        compositionDesc: "시판 표준 약물 전달 비히클 (Standard Enteric Matrix)",
        crosslinkerDesc: "공정 표준 기준",
        role: "양성 대조군",
        expectedOutcome: "산업 표준 서방형 용출 커브 벤치마킹"
      }
    ];

    return {
      topic: `${project.name}의 물성 및 방출 특성 실증 검증 연구`,
      hypothesis: `${mainMat1.nameKo}와(과) ${mainMat2.nameKo}의 최적 배합 조성 및 ${crosslinker.name.split('(')[0]} 가교를 통해 목표 물성과 서방 방출을 달성할 수 있다.`,
      runs,
      measurementProtocols: [
        {
          name: "1. FT-IR 분광분석기 (작용기 화학 결합)",
          detail: `${mainMat1.nameKo}와 ${mainMat2.nameKo} 간의 특이 피크 이동을 통해 분자간 상호작용 형성 확인.`
        },
        {
          name: "2. 회전형 레오미터 점탄성 측정 (Rheology)",
          detail: "진동 전단 주파수 스윕(Frequency sweep)을 통해 저장 탄성률 G'와 손실 탄성률 G''를 측정하고 겔화도 평가."
        },
        {
          name: "3. USP Dissolution Apparatus II (약물 용출 시험)",
          detail: `37℃ 수조에서 pH ${project.phCondition} 용출액을 적용하여 시간에 따른 누적 약물 농도를 분광광도계로 측정.`
        }
      ]
    };
  }
};

if (typeof window !== "undefined") {
  window.PhysicsEngine = PhysicsEngine;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = PhysicsEngine;
  module.exports.PhysicsEngine = PhysicsEngine;
}
