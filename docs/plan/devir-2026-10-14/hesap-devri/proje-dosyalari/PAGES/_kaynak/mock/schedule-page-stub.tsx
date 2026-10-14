// Schedule has its own test page (pages/schedule-test); the atlas does not
// carry it, so its export libraries (pdf.js, exceljs) stay out of every atlas
// page. A route that reaches Schedule shows this instead.
export default function SchedulePageStub() {
  return (
    <main className="app-main" style={{ padding: 32 }}>
      <h1>Schedule</h1>
      <p>Schedule has its own test page (Schedule test page) in the atlas index.</p>
    </main>
  );
}
