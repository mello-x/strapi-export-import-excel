import { Page } from "@strapi/strapi/admin";
import { Route, Routes } from "react-router-dom";
import { ExportPreviewPage } from "./ExportPreviewPage";
import { HomePage } from "./HomePage";

const App = () => {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="export/:uid" element={<ExportPreviewPage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  );
};

export { App };
