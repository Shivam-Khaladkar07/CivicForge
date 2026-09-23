import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { homeFor } from "@/lib/paths";

const LandingPage = lazy(() => import("@/pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ChallengeDetailPage = lazy(() => import("@/pages/ChallengePages").then((m) => ({ default: m.ChallengeDetailPage })));
const ChallengeListPage = lazy(() => import("@/pages/ChallengePages").then((m) => ({ default: m.ChallengeListPage })));
const ChallengeNewPage = lazy(() => import("@/pages/ChallengePages").then((m) => ({ default: m.ChallengeNewPage })));
const ClusterDetailPage = lazy(() => import("@/pages/ClusterPages").then((m) => ({ default: m.ClusterDetailPage })));
const ClusterListPage = lazy(() => import("@/pages/ClusterPages").then((m) => ({ default: m.ClusterListPage })));
const ImpactPage = lazy(() => import("@/pages/ProjectPages").then((m) => ({ default: m.ImpactPage })));
const ProjectDetailPage = lazy(() => import("@/pages/ProjectPages").then((m) => ({ default: m.ProjectDetailPage })));
const ProjectListPage = lazy(() => import("@/pages/ProjectPages").then((m) => ({ default: m.ProjectListPage })));
const AdminPage = lazy(() => import("@/pages/OtherPages").then((m) => ({ default: m.AdminPage })));
const IndustryPage = lazy(() => import("@/pages/OtherPages").then((m) => ({ default: m.IndustryPage })));
const MapPage = lazy(() => import("@/pages/OtherPages").then((m) => ({ default: m.MapPage })));
const NotificationsPage = lazy(() => import("@/pages/OtherPages").then((m) => ({ default: m.NotificationsPage })));
const UniversitiesPage = lazy(() => import("@/pages/OtherPages").then((m) => ({ default: m.UniversitiesPage })));
const ChallengeWizard = lazy(() => import("@/pages/ChallengeWizard").then((m) => ({ default: m.ChallengeWizard })));
const AboutPage = lazy(() => import("@/pages/PublicPages").then((m) => ({ default: m.AboutPage })));
const PublicChallengePage = lazy(() => import("@/pages/PublicPages").then((m) => ({ default: m.PublicChallengePage })));
const PublicChallengesPage = lazy(() => import("@/pages/PublicPages").then((m) => ({ default: m.PublicChallengesPage })));
const FacultyReviewsPage = lazy(() => import("@/pages/RoleWorkspacePages").then((m) => ({ default: m.FacultyReviewsPage })));
const IndustryCollaborationsPage = lazy(() => import("@/pages/RoleWorkspacePages").then((m) => ({ default: m.IndustryCollaborationsPage })));
const StudentTasksPage = lazy(() => import("@/pages/RoleWorkspacePages").then((m) => ({ default: m.StudentTasksPage })));
const UniversityTeamPage = lazy(() => import("@/pages/RoleWorkspacePages").then((m) => ({ default: m.UniversityTeamPage })));

function Guard() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted-foreground">Loading session…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user?.role_id)} replace />;
}

function RoleArea() {
  const { role } = useParams();
  const { user } = useAuth();
  const roleKey = role === "university" ? "university_admin" : role;
  if (roleKey !== user?.role_id && user?.role_id !== "admin") return <Navigate to={homeFor(user?.role_id)} replace />;
  return <AppLayout />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<p className="p-8 text-muted-foreground">Loading CivicForge workspace…</p>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/challenges" element={<PublicChallengesPage />} />
      <Route path="/challenge/:id" element={<PublicChallengePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/app" element={<Guard />}>
        <Route element={<AppLayout />}>
          <Route index element={<RoleHome />} />
          <Route path="challenges" element={<ChallengeListPage />} />
          <Route path="challenges/new" element={<ChallengeNewPage />} />
          <Route path="challenges/:id" element={<ChallengeDetailPage />} />
          <Route path="clusters" element={<ClusterListPage />} />
          <Route path="clusters/:id" element={<ClusterDetailPage />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="universities" element={<UniversitiesPage />} />
          <Route path="industry" element={<IndustryPage />} />
          <Route path="impact" element={<ImpactPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Route>
      <Route element={<Guard />}>
        <Route path="/:role" element={<RoleArea />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="challenges" element={<ChallengeListPage />} />
          <Route path="challenges/new" element={<ChallengeWizard />} />
          <Route path="challenges/:id" element={<ChallengeDetailPage />} />
          <Route path="clusters" element={<ClusterListPage />} />
          <Route path="clusters/:id" element={<ClusterDetailPage />} />
          <Route path="matches" element={<ClusterListPage />} />
          <Route path="projects" element={<ProjectListPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="team" element={<UniversityTeamPage />} />
          <Route path="tasks" element={<StudentTasksPage />} />
          <Route path="reviews" element={<FacultyReviewsPage />} />
          <Route path="interests" element={<IndustryCollaborationsPage />} />
          <Route path="collaborations" element={<IndustryCollaborationsPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="analytics" element={<DashboardPage />} />
          <Route path="universities" element={<UniversitiesPage />} />
          <Route path="industry" element={<IndustryPage />} />
          <Route path="impact" element={<ImpactPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<DashboardPage />} />
          <Route path="users" element={<AdminPage />} />
          <Route path="institutions" element={<UniversitiesPage />} />
          <Route path="industries" element={<IndustryPage />} />
          <Route path="settings" element={<AdminPage />} />
          <Route path="audit" element={<AdminPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
