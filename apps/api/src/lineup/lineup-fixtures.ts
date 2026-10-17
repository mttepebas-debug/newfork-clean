// Real answers of the lineup services (a rolled-back run of the LINEUP-PUBLISH migration on the test world:
// Mia publishes Kadikoy's Dinner, takes it back, publishes it again; Eli acknowledges and reads it).

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
      end_time: "22:00", job_name: "Cook", job_color: "#D39A36", called_off: false, start_time: "16:00",
      label_names: [], section_name: null, crosses_midnight: false,
    }],
    team: [{
      name: "Eli Person", is_me: true, end_time: "22:00", job_name: "Cook", job_color: "#D39A36", called_off: false,
      start_time: "16:00", employee_id: "760ca9d9-68f5-4214-b2a4-12ceb455cd2a", label_names: [], section_name: null,
      department_name: "Kitchen", crosses_midnight: false,
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
  workspace_id: "bd582081-5bae-4793-ab87-43bb7de21e53",
};
