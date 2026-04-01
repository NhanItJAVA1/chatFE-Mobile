import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { HomePage } from "./pages/HomePage";
import { SearchFriendsPage } from "./pages/SearchFriendsPage";
import { FriendRequestsPage } from "./pages/FriendRequestsPage";
import { FriendsPage } from "./pages/FriendsPage";
import { PrivateRoute } from "./components/common/PrivateRoute";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <HomePage />
          </PrivateRoute>
        }
      />
      <Route
        path="/search-friends"
        element={
          <PrivateRoute>
            <SearchFriendsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/friend-requests"
        element={
          <PrivateRoute>
            <FriendRequestsPage />
          </PrivateRoute>
        }
      />
      <Route
        path="/friends"
        element={
          <PrivateRoute>
            <FriendsPage />
          </PrivateRoute>
        }
      />
      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
