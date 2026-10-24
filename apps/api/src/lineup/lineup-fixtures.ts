// Real answers of the lineup services (a rolled-back run of the LINEUP-PUBLISH migration on the test world:
// Mia publishes Kadikoy's Dinner, takes it back, publishes it again; Eli acknowledges and reads it).

// lineup_edit_service: Mia moves Eli's In on Kadikoy's Dinner draft (a rolled-back run of LINEUP-EDIT L2a).
export const editResult = {
  command_id: "6d8e3c52-0e8f-4f3a-9d3c-1f1f3b0c8a13",
  kind: "edit",
  lineup_id: "0a8283c6-3ee5-4888-a252-940ca2200c02",
  row_id: "3f1d6a77-5d0e-4c8b-9b7a-2b3c4d5e6f70",
};

// lineup_sections_service: Mia adds Terrace at Kadikoy, after Patio (the shape lineup_sections.test.sql reads).
export const sectionsResult = {
  location_id: "b340777a-a901-40c5-a3c8-4727ceeb55c7",
  sections: [
    { id: "5b0c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d", location_id: "b340777a-a901-40c5-a3c8-4727ceeb55c7", name: "Patio", sort_order: 1 },
    { id: "6c1d2e3f-4051-4b6c-9d7e-8f9a0b1c2d3e", location_id: "b340777a-a901-40c5-a3c8-4727ceeb55c7", name: "Terrace", sort_order: 2 },
  ],
};

// get_lineup_candidates_service: Kadikoy's kitchen at Lunch, 9 AM - 3 PM (the shape lineup_staff.test.sql reads).
export const candidatesResult = {
  window: { start_time: "09:00", end_time: "15:00" },
  job_id: null,
  candidates: [
    {
      employee_id: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Ana Person", job_ids: ["5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f"],
      job_id: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f", group: "best_fit", score: 100, why: { reason: "no_shift" },
    },
    {
      employee_id: "8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e", name: "Deniz Person", job_ids: ["5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f"],
      job_id: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f", group: "unavailable", score: 45,
      why: { reason: "elsewhere", location_name: "Besiktas", shift_name: "Lunch", start_time: "10:00", end_time: "14:00", partial: true },
    },
  ],
};

export const shareResult = {
  kind: "share",
  lineups: [{
    status: "shared", version: 1, lineup_id: "0a8283c6-3ee5-4888-a252-940ca2200c02",
    version_id: "f929c88f-8608-4429-8d9e-25cc5d860276",
  }],
  command_id: "6d8e3c52-0e8f-4f3a-9d3c-1f1f3b0c8a11",
};

export const unpublishResult = {
  kind: "unpublish",
  lineups: [{ status: "unpublished", version: 1, lineup_id: "0a8283c6-3ee5-4888-a252-940ca2200c02" }],
  command_id: "6d8e3c52-0e8f-4f3a-9d3c-1f1f3b0c8a12",
};

export const acknowledgement = {
  status: "saved",
  version_id: "2cf91b25-c058-4bbf-a835-d969f3b633e7",
  acknowledged_at: "2026-10-17T09:34:24.639422+00:00",
};

export const myLineups = {
  date: "2028-09-11",
  lineups: [{
    id: "0a8283c6-3ee5-4888-a252-940ca2200c02",
    mine: [{
      end_time: "22:00", job_name: "Cook", job_color: "#D39A36", called_off: false, replaced: false, start_time: "16:00",
      art_key: "016-prep-cook",
      label_names: [], section_name: null, crosses_midnight: false,
    }],
    team: [{
      name: "Eli Person", is_me: true, end_time: "22:00", job_name: "Cook", job_color: "#D39A36", called_off: false,
      start_time: "16:00", employee_id: "760ca9d9-68f5-4214-b2a4-12ceb455cd2a", label_names: [], section_name: null,
      department_name: "Kitchen", crosses_midnight: false, art_key: "016-prep-cook",
    }],
    color: "#1F9D74",
    notes: { n86: "", specials: "", shift_notes: "" },
    ask_ack: true,
    version: 2,
    location: { id: "b340777a-a901-40c5-a3c8-4727ceeb55c7", name: "Kadikoy", timezone: "Europe/Istanbul" },
    shared_at: "2026-10-17T09:34:24.639422+00:00",
    version_id: "2cf91b25-c058-4bbf-a835-d969f3b633e7",
    shift_type_id: "c31b6d2a-4a25-4404-8fb0-bd9903551d4c",
    acknowledged_at: "2026-10-17T09:34:24.639422+00:00",
    shift_type_name: "Dinner",
  }],
  // Kadikoy's Brunch, published without her (Mert 2026-10-24): read whole, no ticket, no acknowledgement.
  others: [{
    id: "a79bdb66-e0fd-47ab-b357-eefea6c1292b",
    team: [{
      name: "Noa Person", is_me: false, art_key: "081-salad-prep-ill", end_time: "12:00", job_name: "Cook",
      job_color: "#D39A36", called_off: false, start_time: "09:00", employee_id: "7eb98cc5-8b7c-4e0e-81bc-9a7b19bc0919",
      label_names: [], section_name: null, department_name: "Kitchen", crosses_midnight: false,
    }],
    color: "#D39A36",
    notes: { n86: "", specials: "Shakshuka", shift_notes: "" },
    ask_ack: false,
    version: 1,
    location: { id: "b340777a-a901-40c5-a3c8-4727ceeb55c7", name: "Kadikoy", timezone: "Europe/Istanbul" },
    shared_at: "2026-10-24T07:24:41.038285+00:00",
    version_id: "02f7803f-af66-469f-93a3-bf74deaa6744",
    shift_type_id: "d348d43d-cb33-435e-af7d-ef091da9bf47",
    shift_type_name: "Brunch",
  }],
  workspace_id: "bd582081-5bae-4793-ab87-43bb7de21e53",
};

// get_lineup_day_service for the owner the same day, after Mia published Kadikoy's Dinner (asking to
// acknowledge) and Eli acknowledged it; Besiktas has a shift with no shift type, never published.
export const lineupDay = {
  "date": "2028-09-11",
  "sections": [],
  "locations": [
    {
      "id": "e49ebe95-bfc2-401e-babf-5d1de656b68d",
      "name": "Besiktas",
      "closed": null,
      "lineups": [
        {
          "id": null,
          "rows": [
            {
              "id": null,
              "name": "Bo Person",
              "job_id": "37ba0e0a-fc35-4b66-8a10-d475394e51a6",
              "changed": [],
              "end_time": "22:00",
              "job_name": "Server",
              "shift_id": "eb32cb63-e347-4da4-b1bf-78bbb4074f05",
              "job_color": "#4478A8",
              "label_ids": [],
              "section_id": null,
              "sort_order": null,
              "start_time": "16:00",
              "employee_id": "ba9729ba-8fb0-4c57-aa59-677ac5900638",
              "art_key": "001-server",
              "label_names": [],
              "lineup_only": false,
              "has_app": true,
              "acknowledged_at": null,
              "section_name": null,
              "called_off_at": null,
              "called_off_by": null,
              "replaced_by_row_id": null,
              "department_id": "5599a92c-5bb6-40b5-be06-1e53bcc2ffa8",
              "department_name": "Kitchen",
              "source_shift_id": "be50320c-52d9-4f54-9684-372461ec9a95",
              "crosses_midnight": false,
              "schedule_end_time": "22:00",
              "schedule_start_time": "16:00"
            }
          ],
          "color": null,
          "notes": {
            "n86": "",
            "specials": "",
            "shift_notes": ""
          },
          "people": 1,
          "status": "draft",
          "ask_ack": null,
          "version": null,
          "revision": null,
          "with_app": 1,
          "published": false,
          "shared_at": null,
          "shared_by": null,
          "version_id": null,
          "acknowledged": null,
          "shift_type_id": null,
          "shared_by_name": null,
          "shift_type_name": null
        }
      ],
      "timezone": "Europe/Istanbul",
      "short_hours": null
    },
    {
      "id": "1becc136-8d0e-448f-9875-b7902eb78740",
      "name": "Kadikoy",
      "closed": null,
      "lineups": [
        {
          "id": "710250b6-b07c-4dae-bf1e-7ae7a8dc5b4d",
          "rows": [
            {
              "id": null,
              "name": "Eli Person",
              "job_id": "58de85cc-ea3d-4273-ad94-a9b3abaefd68",
              "changed": [],
              "end_time": "22:00",
              "job_name": "Cook",
              "shift_id": "440fb7b4-6bd2-4353-bb55-eda4131ef292",
              "job_color": "#D39A36",
              "label_ids": [],
              "section_id": null,
              "sort_order": null,
              "start_time": "16:00",
              "employee_id": "44224ba5-39b4-4caf-9959-453689224959",
              "art_key": "015-line-cook",
              "label_names": [],
              "lineup_only": false,
              "has_app": true,
              "acknowledged_at": "2026-10-17T09:34:24.639422+00:00",
              "section_name": null,
              "called_off_at": null,
              "called_off_by": null,
              "replaced_by_row_id": null,
              "department_id": "5599a92c-5bb6-40b5-be06-1e53bcc2ffa8",
              "department_name": "Kitchen",
              "source_shift_id": "4d1581ea-be80-4e60-a350-3875763b288d",
              "crosses_midnight": false,
              "schedule_end_time": "22:00",
              "schedule_start_time": "16:00"
            },
            {
              "id": null,
              "name": "Mia Person",
              "job_id": "58de85cc-ea3d-4273-ad94-a9b3abaefd68",
              "changed": [],
              "end_time": "23:30",
              "job_name": "Cook",
              "shift_id": "fadc67dd-28f3-4e55-9722-594aab24e134",
              "job_color": "#D39A36",
              "label_ids": [],
              "section_id": null,
              "sort_order": null,
              "start_time": "17:00",
              "employee_id": "37aa71a4-48a6-4eb6-b68f-8d03db074c6e",
              "art_key": "016-prep-cook",
              "label_names": [],
              "lineup_only": false,
              "has_app": true,
              "acknowledged_at": null,
              "section_name": null,
              "called_off_at": null,
              "called_off_by": null,
              "replaced_by_row_id": null,
              "department_id": "5599a92c-5bb6-40b5-be06-1e53bcc2ffa8",
              "department_name": "Kitchen",
              "source_shift_id": "61fdae84-2fa2-4b52-bb58-6d1351b44e82",
              "crosses_midnight": false,
              "schedule_end_time": "23:30",
              "schedule_start_time": "17:00"
            }
          ],
          "color": "#1F9D74",
          "notes": {
            "n86": "",
            "specials": "",
            "shift_notes": ""
          },
          "people": 2,
          "status": "shared",
          "ask_ack": true,
          "version": 1,
          "revision": 2,
          "with_app": 2,
          "published": true,
          "shared_at": "2026-10-17T09:48:50.540623+00:00",
          "shared_by": "358ce37a-fa2f-4e94-98a8-8d2269a26a72",
          "version_id": "9ee08a43-b13d-473d-834c-414871230e66",
          "acknowledged": 1,
          "shift_type_id": "8f64971f-15de-40e0-9b18-edc24428fc4c",
          "shared_by_name": "Mia Person",
          "shift_type_name": "Dinner"
        }
      ],
      "timezone": "Europe/Istanbul",
      "short_hours": null
    }
  ],
  "workspace_id": "5ad738d1-44eb-4ea5-a7a7-37bb87809484"
};
