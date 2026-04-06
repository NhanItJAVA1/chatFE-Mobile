import { configureRuntime } from "./shared/runtime";
import { BrowserRouter } from "react-router-dom";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./shared/context";
import App from "./App.jsx";
import "./web/styles/globals.css";

configureRuntime({
  apiUrl: import.meta.env.VITE_API_URL || "http://localhost:3000/v1",
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
);
