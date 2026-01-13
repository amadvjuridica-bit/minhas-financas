import React from "react";
import ReactDOM from "react-dom/client";
import "./global.css"; // <-- FORÇA o CSS correto
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
