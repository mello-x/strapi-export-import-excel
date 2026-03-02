import { Page } from "@strapi/strapi/admin";
import { Routes, Route } from "react-router-dom";

import { HomePage } from "./HomePage";
import { CollectionDetailPage } from "./CollectionDetailPage";
import { ExportPreviewPage } from "./ExportPreviewPage";

const App = () => {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="collections/:uid" element={<CollectionDetailPage />} />
      <Route path="export/:uid" element={<ExportPreviewPage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  );
};

export { App };
