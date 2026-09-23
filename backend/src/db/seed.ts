import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { migrate, query, queryOne } from "./index.js";
import { getAIProvider } from "../ai/index.js";
import { computePriority, DEFAULT_MATCH_WEIGHTS, DEFAULT_PRIORITY_WEIGHTS } from "../services/priority.js";
import { recommendUniversities } from "../services/matching.js";
import { ensureRuntimeExtras } from "./ensure.js";

const DEMO_PASSWORD = "Demo@12345";

async function upsertUser(id: string, email: string, name: string, role: string) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  await query(
    `INSERT INTO users (id, email, password_hash, full_name, role_id, phone, is_demo)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [id, email, hash, name, role, "0651-000000"]
  );
}

export async function seed() {
  await migrate();

  const already = await queryOne<{ c: string }>("SELECT COUNT(*)::text AS c FROM users");
  if (Number(already?.c ?? 0) > 0) {
    await ensureRuntimeExtras();
    console.log("Seed skipped — existing data kept. Runtime extras + Golden Demo related reports ensured.");
    return;
  }

  const roles = [
    ["citizen", "Citizen", "Residents reporting societal challenges"],
    ["government", "Government / Panchayat-ULB", "Validates challenges and oversees public interest"],
    ["university_admin", "University Admin", "Manages institutional matching and labs"],
    ["faculty", "Faculty / Mentor", "Mentors multidisciplinary student teams"],
    ["student", "Student", "Builds prototypes and runs pilots"],
    ["industry", "Industry / Startup / CSR", "Offers funding, labs, and mentorship"],
    ["admin", "System Admin", "Configures scoring weights and access"],
  ];
  for (const [id, name, description] of roles) {
    await query("INSERT INTO roles (id, name, description) VALUES ($1,$2,$3)", [id, name, description]);
  }

  const perms: [string, string, string][] = [
    ["p1", "challenge:create", "Submit a challenge"],
    ["p2", "challenge:read", "Read challenges"],
    ["p3", "challenge:validate", "Validate or reject challenges"],
    ["p4", "challenge:cluster", "Group challenges into clusters"],
    ["p5", "match:recommend", "Generate university match recommendations"],
    ["p6", "match:approve", "Approve university assignment"],
    ["p7", "project:read", "View projects"],
    ["p8", "project:write", "Update project execution"],
    ["p9", "industry:offer", "Submit funding or mentorship offers"],
    ["p10", "admin:settings", "Edit scoring weights"],
    ["p11", "admin:users", "Manage users"],
    ["p12", "admin:audit", "View audit logs"],
    ["p13", "citizen:read_sensitive", "Read restricted citizen health fields"],
    ["p14", "comment:write", "Comment on entities"],
  ];
  for (const p of perms) {
    await query("INSERT INTO permissions (id, code, description) VALUES ($1,$2,$3)", p);
  }

  const matrix: Record<string, string[]> = {
    citizen: ["p1", "p2", "p7", "p14"],
    government: ["p2", "p3", "p4", "p5", "p6", "p7", "p12", "p14"],
    university_admin: ["p2", "p5", "p7", "p8", "p14"],
    faculty: ["p2", "p7", "p8", "p14"],
    student: ["p2", "p7", "p8", "p14"],
    industry: ["p2", "p7", "p9", "p14"],
    admin: perms.map((p) => p[0]),
  };
  for (const [role, ids] of Object.entries(matrix)) {
    for (const pid of ids) {
      await query("INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)", [role, pid]);
    }
  }

  await query(
    `INSERT INTO system_settings (key, value_json, description) VALUES
     ('priority_weights', $1, 'CivicForge Decision Support Score weights — admin configurable, not a scientific formula'),
     ('match_weights', $2, 'Weights for university matching — admin configurable'),
     ('demo_banner', $3, 'Honesty banner text')`,
    [
      JSON.stringify(DEFAULT_PRIORITY_WEIGHTS),
      JSON.stringify(DEFAULT_MATCH_WEIGHTS),
      JSON.stringify({
        text: "Demo Environment — all records are prototype / synthetic data, not official government statistics.",
      }),
    ]
  );

  const categories = [
    ["cat_edu", "education", "Education"],
    ["cat_health", "healthcare", "Healthcare"],
    ["cat_agri", "agriculture", "Agriculture"],
    ["cat_water", "water", "Water"],
    ["cat_san", "sanitation", "Sanitation"],
    ["cat_env", "environment", "Environment"],
    ["cat_energy", "energy", "Energy"],
    ["cat_acc", "accessibility", "Accessibility"],
    ["cat_urban", "urban_infra", "Urban infrastructure"],
    ["cat_rural", "rural_livelihoods", "Rural livelihoods"],
    ["cat_admin", "public_admin", "Public administration"],
  ];
  for (const c of categories) {
    await query("INSERT INTO challenge_categories (id, slug, name) VALUES ($1,$2,$3)", c);
  }

  const ids = {
    citizen: uuid(),
    citizen2: uuid(),
    gov: uuid(),
    uni: uuid(),
    faculty: uuid(),
    student: uuid(),
    student2: uuid(),
    industry: uuid(),
    admin: uuid(),
  };

  await upsertUser(ids.citizen, "citizen@demo.in", "Sunita Devi", "citizen");
  await upsertUser(ids.citizen2, "citizen2@demo.in", "Rakesh Mahato", "citizen");
  await upsertUser(ids.gov, "gov@demo.in", "Asha Kujur (ULB Officer)", "government");
  await upsertUser(ids.uni, "uniadmin@demo.in", "Prof. N. Sinha", "university_admin");
  await upsertUser(ids.faculty, "faculty@demo.in", "Dr. Meera Tirkey", "faculty");
  await upsertUser(ids.student, "student@demo.in", "Aman Toppo", "student");
  await upsertUser(ids.student2, "student2@demo.in", "Priya Kumari", "student");
  await upsertUser(ids.industry, "industry@demo.in", "Kavita Rao (CSR)", "industry");
  await upsertUser(ids.admin, "admin@demo.in", "System Admin", "admin");

  await query(
    `INSERT INTO citizens (id, user_id, district, block_or_ward, health_notes)
     VALUES ($1,$2,'Palamu','Chainpur','Restricted field: family reports fluoride-related dental staining (demo only).'),
            ($3,$4,'Dhanbad','Jharia','Restricted field: respiratory irritation noted by reporter (demo only).')`,
    [uuid(), ids.citizen, uuid(), ids.citizen2]
  );

  const orgUni1 = uuid();
  const orgUni2 = uuid();
  const orgUni3 = uuid();
  const orgGov = uuid();
  const orgInd = uuid();
  const orgCsr = uuid();
  const orgStart = uuid();

  await query(
    `INSERT INTO organizations (id, name, type, district, description, is_demo) VALUES
     ($1,'BIT Mesra (demo profile)','university','Ranchi','Engineering campus used as a demo partner profile', TRUE),
     ($2,'NIT Jamshedpur (demo profile)','university','East Singhbhum','Demo university profile for matching', TRUE),
     ($3,'IIT (ISM) Dhanbad (demo profile)','university','Dhanbad','Demo mining/environment research profile', TRUE),
     ($4,'Ranchi Municipal Corporation (demo)','government','Ranchi','Demo ULB desk', TRUE),
     ($5,'Jamshedpur industrial CSR desk (demo)','industry','East Singhbhum','Demo CSR collaboration desk', TRUE),
     ($6,'Jharkhand Water CSR Cell (demo)','csr','Ranchi','Demo CSR water & sanitation focus', TRUE),
     ($7,'JalSetu Labs (demo startup)','startup','Ranchi','Demo water-quality hardware startup', TRUE)`,
    [orgUni1, orgUni2, orgUni3, orgGov, orgInd, orgCsr, orgStart]
  );

  await query("INSERT INTO government_departments (id, organization_id, name, jurisdiction, user_id) VALUES ($1,$2,$3,$4,$5)", [
    uuid(),
    orgGov,
    "Urban services & sanitation desk",
    "Ranchi ULB (demo)",
    ids.gov,
  ]);

  const uni1 = uuid();
  const uni2 = uuid();
  const uni3 = uuid();
  await query("INSERT INTO universities (id, organization_id, name, district, website) VALUES ($1,$2,$3,$4,$5)", [
    uni1,
    orgUni1,
    "BIT Mesra (demo profile)",
    "Ranchi",
    "https://example.invalid/bit-mesra-demo",
  ]);
  await query("INSERT INTO universities (id, organization_id, name, district, website) VALUES ($1,$2,$3,$4,$5)", [
    uni2,
    orgUni2,
    "NIT Jamshedpur (demo profile)",
    "East Singhbhum",
    "https://example.invalid/nit-jsr-demo",
  ]);
  await query("INSERT INTO universities (id, organization_id, name, district, website) VALUES ($1,$2,$3,$4,$5)", [
    uni3,
    orgUni3,
    "IIT (ISM) Dhanbad (demo profile)",
    "Dhanbad",
    "https://example.invalid/iitism-demo",
  ]);

  const dept = async (uni: string, name: string, domain: string) => {
    const id = uuid();
    await query("INSERT INTO departments (id, university_id, name, domain) VALUES ($1,$2,$3,$4)", [id, uni, name, domain]);
    return id;
  };
  const dWater = await dept(uni1, "Civil & Environmental Engineering", "water");
  await dept(uni1, "Computer Science", "public_admin");
  await dept(uni2, "Mechanical & Design", "urban_infra");
  await dept(uni2, "Electrical Engineering", "energy");
  await dept(uni3, "Environmental Science & Engineering", "environment");
  await dept(uni3, "Mining Engineering", "environment");

  const facId = uuid();
  await query(
    `INSERT INTO faculty (id, user_id, university_id, department_id, title, bio)
     VALUES ($1,$2,$3,$4,'Associate Professor','Mentors water-quality sensing and rural WASH projects (demo profile).')`,
    [facId, ids.faculty, uni1, dWater]
  );
  await query("INSERT INTO expertise (id, faculty_id, tag) VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9)", [
    uuid(),
    facId,
    "water quality",
    uuid(),
    facId,
    "fluoride mitigation",
    uuid(),
    facId,
    "community WASH",
  ]);

  await query("INSERT INTO laboratories (id, university_id, name, capability) VALUES ($1,$2,$3,$4)", [
    uuid(),
    uni1,
    "WASH sensing lab (demo)",
    "Field kits for fluoride / turbidity / pH",
  ]);
  await query("INSERT INTO laboratories (id, university_id, name, capability) VALUES ($1,$2,$3,$4)", [
    uuid(),
    uni3,
    "Air quality instrumentation lab (demo)",
    "PM2.5/PM10 sensors and mine-dust sampling",
  ]);
  await query("INSERT INTO laboratories (id, university_id, name, capability) VALUES ($1,$2,$3,$4)", [
    uuid(),
    uni2,
    "Product design studio (demo)",
    "Low-cost hardware prototyping and fabrication",
  ]);

  await query(
    `INSERT INTO institution_projects (id, university_id, title, summary, year) VALUES
     ($1,$2,'Community fluoride filter trials (demo archive)','Prior student project on household filters in plateau districts.', 2024),
     ($3,$4,'Mine-adjacent air monitors (demo archive)','Low-cost monitors around coal-belt settlements.', 2023)`,
    [uuid(), uni1, uuid(), uni3]
  );

  const indId = uuid();
  const csrId = uuid();
  const startId = uuid();
  await query("INSERT INTO industries (id, organization_id, name, sector, district) VALUES ($1,$2,$3,$4,$5)", [
    indId,
    orgInd,
    "Jamshedpur industrial CSR desk (demo)",
    "manufacturing",
    "East Singhbhum",
  ]);
  await query("INSERT INTO csr_organizations (id, organization_id, name, focus) VALUES ($1,$2,$3,$4)", [
    csrId,
    orgCsr,
    "Jharkhand Water CSR Cell (demo)",
    "safe drinking water",
  ]);
  await query("INSERT INTO startups (id, organization_id, name, focus) VALUES ($1,$2,$3,$4)", [
    startId,
    orgStart,
    "JalSetu Labs (demo startup)",
    "water quality hardware",
  ]);

  const clusterWater = uuid();
  const clusterAir = uuid();
  const clusterEdu = uuid();
  await query(
    `INSERT INTO challenge_clusters (id, title, category_id, summary, district_focus, status) VALUES
     ($1,'Safe drinking water — plateau & mine-belt settlements (demo cluster)', 'cat_water',
      'Multiple citizen reports of fluoride, turbidity, and unreliable handpumps. Clustered for a joint WASH innovation brief.', 'Palamu', 'matched'),
     ($2,'Mine-dust and settlement air quality (demo cluster)', 'cat_env',
      'Reports from Dhanbad and Bokaro on dust, respiratory irritation, and lack of local monitoring.', 'Dhanbad', 'open'),
     ($3,'Upper-primary teacher shortage & dropout risk (demo cluster)', 'cat_edu',
      'Schools in Dumka and Deoghar reporting multi-grade classrooms and irregular specialist teachers.', 'Dumka', 'open')`,
    [clusterWater, clusterAir, clusterEdu]
  );

  type Ch = {
    id: string;
    title: string;
    description: string;
    cat: string;
    reporter: string;
    status: string;
    district: string;
    block: string;
    severity: number;
    pop: number;
    cluster: string | null;
    lat: number;
    lng: number;
    locality: string;
    tags: string[];
  };

  const challenges: Ch[] = [
    {
      id: uuid(),
      title: "Handpump water stains teeth in Chainpur villages",
      description:
        "Residents in Chainpur block, Palamu, report yellow-brown staining on children's teeth and a bitter taste from several handpumps. Households boil water but staining continues. Request for testing and a low-cost treatment option that can be maintained locally.",
      cat: "cat_water",
      reporter: ids.citizen,
      status: "validated",
      district: "Palamu",
      block: "Chainpur",
      severity: 5,
      pop: 4200,
      cluster: clusterWater,
      lat: 24.2,
      lng: 84.07,
      locality: "Chainpur",
      tags: ["fluoride", "handpump", "WASH"],
    },
    {
      id: uuid(),
      title: "Seasonal turbidity after rains near Latehar border hamlets",
      description:
        "After monsoon showers, open wells turn muddy for days. Women walk farther to a privately owned borehole. Need a community filter and well-protection design, not a complaint ticket.",
      cat: "cat_water",
      reporter: ids.citizen,
      status: "validated",
      district: "Palamu",
      block: "Patan",
      severity: 4,
      pop: 1800,
      cluster: clusterWater,
      lat: 24.18,
      lng: 84.15,
      locality: "Patan",
      tags: ["turbidity", "wells"],
    },
    {
      id: uuid(),
      title: "Coal-belt dust on Jharia settlement rooftops",
      description:
        "Households near Jharia report thick dust on terraces and children coughing at night. There is no locally readable air monitor. Community wants a simple public display and a school-yard barrier plantation trial.",
      cat: "cat_env",
      reporter: ids.citizen2,
      status: "validated",
      district: "Dhanbad",
      block: "Jharia",
      severity: 5,
      pop: 9000,
      cluster: clusterAir,
      lat: 23.74,
      lng: 86.41,
      locality: "Jharia",
      tags: ["PM", "mine dust"],
    },
    {
      id: uuid(),
      title: "Bokaro township nullah overflow in heavy rain",
      description:
        "Low-lying lanes flood with mixed stormwater and garbage. Residents want a drain-mapping exercise and a student-built silt-trap prototype before next monsoon.",
      cat: "cat_urban",
      reporter: ids.citizen2,
      status: "under_review",
      district: "Bokaro",
      block: "Sector 4",
      severity: 4,
      pop: 6000,
      cluster: null,
      lat: 23.67,
      lng: 86.15,
      locality: "Bokaro Steel City",
      tags: ["flood", "drain"],
    },
    {
      id: uuid(),
      title: "Upper-primary school running as multi-grade in Dumka",
      description:
        "One teacher handles classes 6–8 on several days. Science periods are skipped. SMC asks for a blended teaching kit and a rostering tool that works offline.",
      cat: "cat_edu",
      reporter: ids.citizen,
      status: "validated",
      district: "Dumka",
      block: "Jama",
      severity: 4,
      pop: 320,
      cluster: clusterEdu,
      lat: 24.27,
      lng: 87.25,
      locality: "Jama",
      tags: ["teacher shortage", "multi-grade"],
    },
    {
      id: uuid(),
      title: "Irrigation pond silted in Giridih paddy belt",
      description:
        "A village pond that supported rabi irrigation is silted. Farmers want a desilt-and-reuse plan plus a soil-moisture advisory that does not require smartphones for every household.",
      cat: "cat_agri",
      reporter: ids.citizen,
      status: "submitted",
      district: "Giridih",
      block: "Bengabad",
      severity: 3,
      pop: 1500,
      cluster: null,
      lat: 24.18,
      lng: 86.3,
      locality: "Bengabad",
      tags: ["irrigation", "pond"],
    },
    {
      id: uuid(),
      title: "PHC referral delays from forest-fringe hamlets, East Singhbhum",
      description:
        "Patients from hill hamlets miss referral windows because transport is irregular after 4 pm. ASHA workers asked for a shared-ride roster and a simple emergency contact board at the haat.",
      cat: "cat_health",
      reporter: ids.citizen,
      status: "under_review",
      district: "East Singhbhum",
      block: "Potka",
      severity: 4,
      pop: 2200,
      cluster: null,
      lat: 22.65,
      lng: 86.25,
      locality: "Potka",
      tags: ["referral", "transport"],
    },
    {
      id: uuid(),
      title: "Public building without ramps at Deoghar block office",
      description:
        "Certificate counters are on a raised plinth with steps only. Persons with reduced mobility wait outside. Request for a modular ramp and counter-height redesign that a polytechnic team can fabricate.",
      cat: "cat_acc",
      reporter: ids.citizen2,
      status: "submitted",
      district: "Deoghar",
      block: "Deoghar sadar",
      severity: 3,
      pop: 800,
      cluster: null,
      lat: 24.48,
      lng: 86.7,
      locality: "Deoghar",
      tags: ["ramp", "public building"],
    },
    {
      id: uuid(),
      title: "Evening grid outages stall cold storage for Hazaribagh vegetable growers",
      description:
        "A farmer-producer group loses leafy vegetables after 6 pm outages. They want a solar-hybrid cooler sized for a haat, not a full warehouse.",
      cat: "cat_energy",
      reporter: ids.citizen,
      status: "submitted",
      district: "Hazaribagh",
      block: "Katkamsandi",
      severity: 3,
      pop: 900,
      cluster: null,
      lat: 24.0,
      lng: 85.36,
      locality: "Katkamsandi",
      tags: ["solar", "cold storage"],
    },
    {
      id: uuid(),
      title: "NTFP collection prices opaque in Ramgarh weekly market",
      description:
        "Mahua and lac collectors say rates change by the hour with no posted reference. A student team is asked to prototype a large-print rate board plus a voice-note price log.",
      cat: "cat_rural",
      reporter: ids.citizen2,
      status: "submitted",
      district: "Ramgarh",
      block: "Mandu",
      severity: 3,
      pop: 1100,
      cluster: null,
      lat: 23.63,
      lng: 85.51,
      locality: "Mandu",
      tags: ["NTFP", "price information"],
    },
    {
      id: uuid(),
      title: "Caste certificate queue overflows at Ranchi CSC",
      description:
        "Applicants wait a full day; token slips are paper-only. Youth volunteers requested an SMS token and document-checklist poster in Hindi and Nagpuri.",
      cat: "cat_admin",
      reporter: ids.citizen,
      status: "under_review",
      district: "Ranchi",
      block: "Argora",
      severity: 2,
      pop: 5000,
      cluster: null,
      lat: 23.35,
      lng: 85.31,
      locality: "Argora",
      tags: ["CSC", "certificates"],
    },
    {
      id: uuid(),
      title: "Open dumping beside Dumka bus stand drains",
      description:
        "Food waste blocks a roadside drain. Ward members want a source-segregation stall design that vendors will actually use.",
      cat: "cat_san",
      reporter: ids.citizen2,
      status: "submitted",
      district: "Dumka",
      block: "Ward 8",
      severity: 3,
      pop: 2500,
      cluster: null,
      lat: 24.27,
      lng: 87.25,
      locality: "Dumka bus stand",
      tags: ["solid waste", "vendors"],
    },
  ];

  const ai = getAIProvider();
  for (const ch of challenges) {
    await query(
      `INSERT INTO challenges (id, title, description, category_id, reporter_id, status, district, block_or_ward, severity, population_estimate, is_demo, cluster_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11)`,
      [
        ch.id,
        ch.title,
        ch.description,
        ch.cat,
        ch.reporter,
        ch.status,
        ch.district,
        ch.block,
        ch.severity,
        ch.pop,
        ch.cluster,
      ]
    );
    await query(
      `INSERT INTO challenge_locations (id, challenge_id, district, locality, lat, lng) VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), ch.id, ch.district, ch.locality, ch.lat, ch.lng]
    );
    for (const tag of ch.tags) {
      await query("INSERT INTO challenge_tags (id, challenge_id, tag) VALUES ($1,$2,$3)", [uuid(), ch.id, tag]);
    }
    const analysis = await ai.classify(`${ch.title} ${ch.description}`);
    const summary = await ai.summarize(ch.description);
    const embedding = await ai.embed(`${ch.title} ${ch.description}`);
    await query(
      `INSERT INTO ai_analysis (id, challenge_id, provider, mode, category_slug, summary, suggested_tags, confidence, confidence_label, human_reviewed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        uuid(),
        ch.id,
        ai.name,
        ai.mode,
        analysis.categorySlug,
        summary,
        JSON.stringify(analysis.suggestedTags),
        analysis.confidence,
        "Demo / system score — not a measured ML accuracy",
        ch.status === "validated",
      ]
    );
    await query(`INSERT INTO ai_embeddings (id, challenge_id, vector_json, provider) VALUES ($1,$2,$3,$4)`, [
      uuid(),
      ch.id,
      JSON.stringify(embedding),
      ai.name,
    ]);
    await computePriority(ch.id);
  }

  await query(
    `INSERT INTO challenge_relations (id, from_challenge_id, to_challenge_id, relation) VALUES ($1,$2,$3,'same_cluster')`,
    [uuid(), challenges[0].id, challenges[1].id]
  );

  await recommendUniversities(clusterWater);
  const topMatch = await queryOne<{ id: string; university_id: string }>(
    `SELECT id, university_id FROM university_matches WHERE cluster_id = $1 ORDER BY match_score DESC LIMIT 1`,
    [clusterWater]
  );
  if (topMatch) {
    await query(`UPDATE university_matches SET status = 'approved', approved_by = $1 WHERE id = $2`, [
      ids.gov,
      topMatch.id,
    ]);
  }

  const projectId = uuid();
  await query(
    `INSERT INTO projects (id, cluster_id, university_id, title, summary, stage, lead_user_id, is_demo)
     VALUES ($1,$2,$3,$4,$5,'pilot',$6,TRUE)`,
    [
      projectId,
      clusterWater,
      topMatch?.university_id ?? uni1,
      "Chainpur household fluoride filter + community test kit",
      "Multidisciplinary student team building a maintainable household filter and a panchayat-readable test card, with CSR co-funding for a 40-household pilot.",
      ids.student,
    ]
  );
  const teamId = uuid();
  await query("INSERT INTO project_teams (id, project_id, name) VALUES ($1,$2,$3)", [
    teamId,
    projectId,
    "Jal-Sahay multidisciplinary team",
  ]);
  await query(
    `INSERT INTO team_members (id, team_id, user_id, role_in_team) VALUES
     ($1,$2,$3,'student lead — product'),
     ($4,$5,$6,'student — community research')`,
    [uuid(), teamId, ids.student, uuid(), teamId, ids.student2]
  );
  await query("INSERT INTO mentors (id, project_id, faculty_id, notes) VALUES ($1,$2,$3,$4)", [
    uuid(),
    projectId,
    facId,
    "Weekly WASH lab review (demo)",
  ]);

  const ms = [
    ["Problem framing & water sampling protocol", "done", 1],
    ["Filter prototype v1", "done", 2],
    ["Lab tests (fluoride / flow / cost)", "done", 3],
    ["40-household pilot in Chainpur", "in_progress", 4],
    ["Deployment playbook for panchayat", "pending", 5],
  ];
  const mileIds: string[] = [];
  for (const [title, status, order] of ms) {
    const mid = uuid();
    mileIds.push(mid);
    await query(
      `INSERT INTO milestones (id, project_id, title, due_date, status, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [mid, projectId, title, "2026-11-01", status, order]
    );
  }
  await query("INSERT INTO tasks (id, milestone_id, title, assignee_id, status) VALUES ($1,$2,$3,$4,$5)", [
    uuid(),
    mileIds[3],
    "Install 10 filters with Jal-Sahay volunteers",
    ids.student,
    "in_progress",
  ]);
  await query("INSERT INTO documents (id, project_id, title, url, doc_type) VALUES ($1,$2,$3,$4,$5)", [
    uuid(),
    projectId,
    "Pilot consent note (demo)",
    "/docs/pilot-consent-demo.pdf",
    "protocol",
  ]);

  const protoId = uuid();
  await query(
    `INSERT INTO prototypes (id, project_id, name, description, status) VALUES ($1,$2,$3,$4,'tested')`,
    [
      protoId,
      projectId,
      "Two-stage laterite + activated alumina cartridge (demo)",
      "Gravity filter sized for 8–10 L/day household use. Cartridge swap designed for a local SHG kiosk.",
    ]
  );
  await query("INSERT INTO tests (id, prototype_id, name, result, notes) VALUES ($1,$2,$3,$4,$5)", [
    uuid(),
    protoId,
    "Bench fluoride reduction (demo lab)",
    "Predicted: 1.8 mg/L → 0.7 mg/L on spiked sample. Not a certified lab result.",
    "Demo / prototype test — not NABL certification.",
  ]);
  await query(
    `INSERT INTO pilots (id, project_id, location, start_date, end_date, status, beneficiaries_estimate)
     VALUES ($1,$2,'Chainpur block, Palamu (demo pilot)', '2026-07-01', '2026-12-15', 'active', 40)`,
    [uuid(), projectId]
  );

  await query(
    `INSERT INTO industry_interests (id, industry_id, csr_id, startup_id, project_id, interest_type, notes)
     VALUES ($1,$2,NULL,NULL,$3,'in-kind fabrication','Sheet metal housings (demo)'),
            ($4,NULL,$5,NULL,$3,'csr grant','Cartridge replenishment for 6 months (demo)'),
            ($6,NULL,NULL,$7,$3,'technical collab','Sensor strip for field kit (demo)')`,
    [uuid(), indId, projectId, uuid(), csrId, uuid(), startId]
  );
  await query(
    `INSERT INTO funding_offers (id, project_id, organization_name, amount_inr, status, notes)
     VALUES ($1,$2,'Jharkhand Water CSR Cell (demo)', 450000, 'accepted', 'Demo offer — not a real disbursement')`,
    [uuid(), projectId]
  );
  await query(
    `INSERT INTO mentorship_offers (id, project_id, from_name, expertise, status)
     VALUES ($1,$2,'Kavita Rao (CSR desk, demo)','Community operations & SHG kiosks','accepted')`,
    [uuid(), projectId]
  );

  await query(
    `INSERT INTO impact_metrics (id, project_id, name, unit, predicted_value, verified_value, verification_note, measured_at)
     VALUES
     ($1,$2,'Households with working filter','households',40,12,'Verified by student field log (12 installs). Predicted 40 by Dec 2026.','2026-08-20'),
     ($3,$2,'Median fluoride at tap (demo kit)','mg/L',0.7,NULL,'Predicted from bench test only — not yet verified in all households.', NULL),
     ($4,$2,'Women hours saved fetching alternate water','hours/week',6,NULL,'Predicted from baseline interviews. Not yet verified.', NULL)`,
    [uuid(), projectId, uuid(), uuid()]
  );

  await query("INSERT INTO comments (id, entity_type, entity_id, user_id, body) VALUES ($1,$2,$3,$4,$5)", [
    uuid(),
    "challenge",
    challenges[0].id,
    ids.gov,
    "Validated after desk review of photos and a 2024 district water-quality brief (demo). Sending to WASH cluster.",
  ]);
  await query("INSERT INTO messages (id, project_id, user_id, body) VALUES ($1,$2,$3,$4)", [
    uuid(),
    projectId,
    ids.faculty,
    "Bring the flow-rate log to Friday lab. Keep language on impact cards as predicted vs verified.",
  ]);
  await query("INSERT INTO notifications (id, user_id, title, body) VALUES ($1,$2,$3,$4)", [
    uuid(),
    ids.citizen,
    "Your Palamu water report was validated",
    "A government officer validated the challenge (demo). It is now in the safe-water cluster.",
  ]);
  await query("INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6)", [
    uuid(),
    ids.gov,
    "challenge.validate",
    "challenge",
    challenges[0].id,
    "Human-in-the-loop validation (seed)",
  ]);

  console.log("Seed complete. Demo password for all @demo.in accounts: Demo@12345");
  await ensureRuntimeExtras();
}

if (process.argv[1]?.includes("seed")) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
