import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import MoviesPage from "./pages/MoviesPage";
import MovieDetailPage from "./pages/MovieDetailPage";
import ShowtimesPage from "./pages/ShowtimesPage";
import CinemasPage from "./pages/CinemasPage";
import CinemaDetailPage from "./pages/CinemaDetailPage";
import ChatPage from "./pages/ChatPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import PageNotFound from "./pages/PageNotFound";
import SearchPage from "./pages/SearchPage";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import WatchlistPage from "./pages/WatchListPage";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate replace to="/movies" />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/movie/:id" element={<MovieDetailPage />} />
            <Route path="/movie/:id/cinemas" element={<ShowtimesPage />} />
            <Route path="/cinemas" element={<CinemasPage />} />
            <Route path="/cinemas/:slug" element={<CinemaDetailPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
            </Route>
          </Route>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
