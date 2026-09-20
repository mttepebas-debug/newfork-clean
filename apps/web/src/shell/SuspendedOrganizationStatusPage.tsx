import { useNavigate } from "react-router";
import { PreBizFrame } from "./prebiz/PreBiz";

export default function SuspendedOrganizationStatusPage() {
  const navigate = useNavigate();
  return (
    <PreBizFrame
      titleId="suspended-organization-title"
      title="This workspace is on hold"
      description="Nothing in it can be opened until an owner or an admin lifts the hold. Ask one of them if you think it should be."
    >
      <div className="pb-footer">
        <button
          type="button"
          className="pb-btn pb-btn-primary"
          onClick={() => navigate("/organization-switcher")}
        >
          Choose a workspace
        </button>
      </div>
    </PreBizFrame>
  );
}
