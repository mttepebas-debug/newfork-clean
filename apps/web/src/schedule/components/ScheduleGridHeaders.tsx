import type { SchedulingSettings } from "@newfork/shared";
import type { ScheduleReadModel } from "@newfork/shared/schedule";

import type { ScheduleLogoSaveDraft } from "./ScheduleLogoUploadDialog";
import type { ScheduleGridLocationGroup } from "../lib/scheduleGridLayout";
import { ScheduleDayHeaderCells } from "./ScheduleDayHeaderCells";
import { ScheduleLocationHeader } from "./ScheduleLocationHeader";
import { ScheduleLogoFrame } from "./ScheduleLogoFrame";

export function ScheduleGridHeaders({
  closures,
  days,
  importantDates,
  locationGroups,
  organizationLogoPlacement,
  organizationLogoUrl,
  organizationName,
  selectedDate,
  showTotalHours,
  timeFormat,
  weekStartDate,
  currentDate,
  publishWarnings,
  publishDeadlineDay,
  onDayHeaderClick,
  onManageLogo,
  onOpenPost,
  onToggleLocationFilter,
}: {
  readonly closures: ScheduleReadModel["closures"];
  readonly days: readonly string[];
  readonly importantDates: ScheduleReadModel["important_dates"];
  readonly locationGroups: readonly ScheduleGridLocationGroup[];
  readonly organizationLogoPlacement: ScheduleLogoSaveDraft["placement"] | null;
  readonly organizationLogoUrl: string | null;
  readonly organizationName: string;
  readonly selectedDate: string;
  readonly showTotalHours: boolean;
  readonly timeFormat?: ScheduleReadModel["settings"]["time_format"];
  readonly weekStartDate: string;
  readonly currentDate?: string;
  readonly publishWarnings?: boolean;
  readonly publishDeadlineDay?: SchedulingSettings["schedule_deadline_day"];
  readonly onDayHeaderClick: (
    date: string,
    locationIds: readonly string[],
  ) => void;
  readonly onManageLogo?: () => void;
  readonly onOpenPost?: (announcementId: string) => void;
  readonly onToggleLocationFilter: (locationIds: readonly string[]) => void;
}) {
  return (
    <>
      <div
        className="schedule-grid-corner schedule-grid-sticky"
        role="columnheader"
        data-testid="schedule-sticky-left-header-cap"
        data-schedule-header-corner-bridge="true"
        data-schedule-header-cap-bottom-separator="true"
        data-schedule-pinned-cell="header-cap"
        data-schedule-logo-slot="expanded"
      >
        <ScheduleLogoFrame
          logoUrl={organizationLogoUrl}
          organizationName={organizationName}
          placement={organizationLogoPlacement}
          className={`schedule-grid-logo-frame${
            onManageLogo ? " schedule-grid-logo-button" : ""
          }`}
          imageClassName="schedule-logo-image"
          onClick={onManageLogo}
          testId="schedule-organization-logo"
          frameTestId="schedule-organization-logo-frame"
          fallbackTestId="schedule-generated-organization-logo"
        />
      </div>
      {locationGroups.map((location, locationIndex) => (
        <ScheduleLocationHeader
          key={location.id}
          location={location}
          locationIndex={locationIndex}
          daysLength={days.length}
          weekStartDate={weekStartDate}
          currentDate={currentDate}
          publishWarnings={publishWarnings}
          publishDeadlineDay={publishDeadlineDay}
          onToggleLocationFilter={onToggleLocationFilter}
        />
      ))}
      {showTotalHours ? (
        <div
          className="schedule-total-header"
          role="columnheader"
          aria-label="Total hours"
          data-schedule-total-hours-header="true"
          data-schedule-total-column-cell="true"
        >
          Total
        </div>
      ) : null}
      <div
        className="schedule-employee-header schedule-grid-sticky"
        role="columnheader"
        data-testid="schedule-sticky-employee-header-seam"
        data-schedule-header-bottom-separator="true"
        data-schedule-left-boundary="true"
        data-schedule-pinned-cell="employee"
      >
        Employees
      </div>
      <ScheduleDayHeaderCells
        closures={closures}
        days={days}
        importantDates={importantDates}
        locationGroups={locationGroups}
        selectedDate={selectedDate}
        timeFormat={timeFormat}
        onDayHeaderClick={onDayHeaderClick}
        onOpenPost={onOpenPost}
      />
      {showTotalHours ? (
        <div
          className="schedule-total-subheader"
          role="columnheader"
          data-schedule-total-hours-row-gutter="true"
          data-schedule-total-column-cell="true"
        >
          Week
        </div>
      ) : null}
    </>
  );
}
