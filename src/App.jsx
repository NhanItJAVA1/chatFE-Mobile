import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage, RegisterPage, HomePage, SearchFriendsPage, FriendRequestsPage, FriendsPage } from "./web/pages";
import { PrivateRoute } from "./web/components/common";

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
