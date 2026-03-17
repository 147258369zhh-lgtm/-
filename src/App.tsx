import { useState, useEffect, useMemo, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { ProjectCard } from "./components/ProjectCard";
import { CreateProjectModal } from "./components/CreateProjectModal";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { TemplateManager } from "./components/TemplateManager";
import { CommonInfoManager } from "./components/CommonInfoManager";
import { SettingsManager } from "./components/SettingsManager";
import { useStore } from "./store/useStore";
import { invoke } from "@tauri-apps/api/core";
import { Search, Filter, Plus, LayoutGrid, MapPin, Tag } from "lucide-react";
import logger from "./utils/logger";
import { TitleBar } from "./components/TitleBar";
import { AiChatSidebar } from "./components/AiChatSidebar";
import { TravelManager } from "./components/TravelManager";
import { GridOverlay } from "./components/GridOverlay";
import { Suspense, lazy } from "react";

const AIHub = lazy(() => import("./components/AIHub"));

function App() {
  const [activeTab, setActiveTab] = useState("projects");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { projects, setProjects, activeProject, setActiveProject, theme } =
    useStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("全部");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [metaHistory, setMetaHistory] = useState<{
    cities: string[];
    types: string[];
  }>({ cities: [], types: [] });
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isGridVisible, setIsGridVisible] = useState(false);

  // Theme sync: every time `theme` changes, update the html class
  useEffect(() => {
    document.documentElement.classList.remove("dark", "glass");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "glass") {
      document.documentElement.classList.add("glass");
    }
  }, [theme]);

  const fetchProjects = async () => {
    try {
      logger.info('App', 'Fetching projects...');
      const data: any = await invoke("list_projects");
      setProjects(data || []);
      logger.info('App', `Loaded ${(data || []).length} projects`);
      const meta: any = await invoke("get_project_meta_history");
      if (Array.isArray(meta)) {
        setMetaHistory({ cities: meta[0] || [], types: meta[1] || [] });
      }
    } catch (error) {
      logger.error('App', `Failed to fetch projects: ${error}`);
    }
  };

  useEffect(() => {
    logger.info('App', '=== Frontend App Mounted ===');
    fetchProjects();
  }, []);

  const filteredProjects = useMemo(
    () =>
      (projects || []).filter((p) => {
        if (!p || !p.name) return false;
        const matchesSearch =
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.number &&
            p.number.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesCity = cityFilter === "全部" || p.city === cityFilter;
        const matchesType =
          typeFilter === "全部" || p.project_type === typeFilter;
        return !!(matchesSearch && matchesCity && matchesType);
      }),
    [projects, searchQuery, cityFilter, typeFilter],
  );

  const handleToggleAiChat = useCallback(() => setIsAiChatOpen((v) => !v), []);
  const handleTabChange = useCallback((tab: string) => {
    logger.info('App', `Tab changed to: ${tab}`);
    setActiveTab(tab);
    setActiveProject(null);
  }, []);
  const handleOpenCreateModal = useCallback(() => setIsModalOpen(true), []);
  const handleCloseAiChat = useCallback(() => setIsAiChatOpen(false), []);
  const handleCloseModal = useCallback(() => setIsModalOpen(false), []);
  const handleToggleGrid = useCallback(() => setIsGridVisible((v) => !v), []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        backgroundColor: "var(--bg-root)",
        color: "var(--text-primary)",
        overflow: "hidden",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <TitleBar
        onToggleAiChat={handleToggleAiChat}
        isAiChatOpen={isAiChatOpen}
        isGridVisible={isGridVisible}
        onToggleGrid={handleToggleGrid}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          openCreateModal={handleOpenCreateModal}
        />

        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            backgroundColor: "var(--bg-surface)",
            transition: "background-color 0.25s ease",
          }}
        >
          {activeProject ? (
            <ProjectWorkspace />
          ) : activeTab === "projects" ? (
            <div
              className="animate-in fade-in duration-500"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                padding: "32px 32px",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  marginBottom: 32,
                  flexShrink: 0,
                }}
              >
                <div>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: 32,
                      fontWeight: 900,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    项目中心
                  </h1>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 14,
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    Communication Design Project Hub
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 24px",
                    borderRadius: 14,
                    border: "none",
                    background: "var(--brand)",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(37,99,235,0.35)",
                    transition: "var(--transition)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--brand-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--brand)")
                  }
                >
                  <Plus size={18} />
                  <span>启动新项目</span>
                </button>
              </div>

              {/* Search + Filters */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  marginBottom: 24,
                  flexShrink: 0,
                }}
              >
                <div style={{ position: "relative" }}>
                  <Search
                    size={18}
                    style={{
                      position: "absolute",
                      left: 14,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-faint)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="搜索项目名称、编号或特征..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "13px 16px 13px 44px",
                      borderRadius: 14,
                      border: "1.5px solid var(--border)",
                      backgroundColor: "var(--input-bg)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none",
                      transition: "var(--transition)",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = "var(--brand)")
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = "var(--border)")
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  {[
                    {
                      icon: <MapPin size={15} />,
                      options: ["全部", ...metaHistory.cities],
                      value: cityFilter,
                      onChange: setCityFilter,
                      placeholder: "全部地市",
                    },
                    {
                      icon: <Tag size={15} />,
                      options: ["全部", ...metaHistory.types],
                      value: typeFilter,
                      onChange: setTypeFilter,
                      placeholder: "所有类型",
                    },
                  ].map((f, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        borderRadius: 12,
                        border: "1.5px solid var(--border)",
                        backgroundColor: "var(--bg-subtle)",
                      }}
                    >
                      <span
                        style={{ color: "var(--text-faint)", flexShrink: 0 }}
                      >
                        {f.icon}
                      </span>
                      <select
                        value={f.value}
                        onChange={(e) => f.onChange(e.target.value)}
                        style={{
                          flex: 1,
                          border: "none",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          fontSize: 13,
                          outline: "none",
                          cursor: "pointer",
                        }}
                      >
                        {f.options.map((o) => (
                          <option key={o} value={o}>
                            {o === "全部"
                              ? i === 0
                                ? "全部地市"
                                : "所有类型"
                              : o}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button
                    style={{
                      padding: "8px 16px",
                      borderRadius: 12,
                      border: "1.5px solid var(--border)",
                      backgroundColor: "var(--bg-subtle)",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      transition: "var(--transition)",
                    }}
                  >
                    <Filter size={16} />
                  </button>
                </div>
              </div>

              {/* Project Grid */}
              <div
                className="custom-scrollbar"
                style={{ flex: 1, overflowY: "auto", paddingRight: 4 }}
              >
                {filteredProjects.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      paddingBottom: 32,
                    }}
                  >
                    {filteredProjects.map((project) => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onOpen={() => setActiveProject(project)}
                      />
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-faint)",
                    }}
                  >
                    <LayoutGrid
                      size={64}
                      style={{ opacity: 0.1, marginBottom: 16 }}
                    />
                    <p
                      style={{
                        fontSize: 18,
                        opacity: 0.3,
                        fontStyle: "italic",
                        margin: 0,
                      }}
                    >
                      目前此处空空如也
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === "templates" ? (
            <TemplateManager />
          ) : activeTab === "aihub" ? (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  Loading AI HUB...
                </div>
              }
            >
              <AIHub />
            </Suspense>
          ) : activeTab === "common" ? (
            <CommonInfoManager />
          ) : activeTab === "travel" ? (
            <TravelManager />
          ) : activeTab === "settings" ? (
            <SettingsManager />
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-faint)",
              }}
            >
              <LayoutGrid
                size={64}
                style={{ opacity: 0.1, marginBottom: 16 }}
              />
              <p
                style={{
                  opacity: 0.3,
                  textTransform: "uppercase",
                  letterSpacing: "0.2em",
                  margin: 0,
                }}
              >
                {activeTab} Module Under Development
              </p>
            </div>
          )}
        </main>

        <AiChatSidebar isOpen={isAiChatOpen} onClose={handleCloseAiChat} />
      </div>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onCreated={fetchProjects}
      />

      {/* 坐标参考网格，点击标题栏格子图标切换 */}
      <GridOverlay visible={isGridVisible} />

      {/* Liquid Glass SVG refraction filter */}
      {theme === "glass" && (
        <svg
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
          }}
          aria-hidden="true"
        >
          <defs>
            <filter
              id="glass-refract"
              x="-10%"
              y="-10%"
              width="120%"
              height="120%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.015"
                numOctaves="3"
                seed="2"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="3"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}
    </div>
  );
}

export default App;
