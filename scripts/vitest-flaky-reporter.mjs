// CI retries a failed test once (Mert, 2026-10-20: a test that fails now and then must not turn main red).
// A test that passed only on its retry is printed as a GitHub warning, so it shows on the run page
// and gets fixed instead of hiding behind the retry.
export default class FlakyReporter {
  onTestCaseResult(testCase) {
    if (!testCase.diagnostic()?.flaky) return;
    console.log(`::warning title=Flaky test::${testCase.module.moduleId} > ${testCase.fullName}`);
  }
}
