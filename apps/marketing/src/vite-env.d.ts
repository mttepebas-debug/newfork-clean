/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_CONTACT_ENDPOINT?: string;
  readonly VITE_CONTACT_SALES_EMAIL?: string;
  readonly VITE_CONTACT_SUPPORT_EMAIL?: string;
  readonly VITE_CONTACT_PRIVACY_EMAIL?: string;
  readonly VITE_CONTACT_SECURITY_EMAIL?: string;
  readonly VITE_CONTACT_GENERAL_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
