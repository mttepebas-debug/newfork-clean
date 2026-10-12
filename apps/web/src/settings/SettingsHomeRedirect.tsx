import { Navigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { settingsHomePath } from "./settings-access";

export default function SettingsHomeRedirect() {
  return <Navigate to={settingsHomePath(useAuth().context)} replace />;
}
