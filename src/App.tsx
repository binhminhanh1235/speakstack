import { useEffect, useState } from 'preact/hooks';
import { SpeakPack, TierType } from '../shared/schema';
import { STARTER_PACKS } from '../shared/templates';
import {
  DEFAULT_SETTINGS,
  PracticeMode,
  UserProgressData,
  UserSettings,
  idbLoadProgress
} from './lib/storage/idb';
import {
  consumeSpeculativeNextRandom,
  loadAllPacksUnified,
  recordPracticeSession,
  triggerSpeculativeNextRandom,
  updateUserSettings
} from './lib/storage/multi-storage';
import { musicController } from './lib/audio/music-ducking';
import { PracticeStage } from './components/PracticeStage';
import { LibraryView } from './components/LibraryView';
import { DrillsView } from './components/DrillsView';
import { AdminView } from './components/AdminView';

export type NavTab = 'practice' | 'library' | 'drills' | 'admin';

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('practice');
  const [packs, setPacks] = useState<SpeakPack[]>(STARTER_PACKS);
  const [currentPack, setCurrentPack] = useState<SpeakPack>(STARTER_PACKS[0]);
  const [mode, setMode] = useState<PracticeMode>('listen');
  const [tier, setTier] = useState<TierType>(2);
  const [isOfflineFallback, setIsOfflineFallback] = useState(false);

  const [progress, setProgress] = useState<UserProgressData>({
    attempts: [],
    mastery: {},
    weakWords: {},
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: new Date().toISOString()
  });

  const [musicActive, setMusicActive] = useState(false);

  const refreshAllData = async () => {
    const [loadedProgress, unified] = await Promise.all([
      idbLoadProgress(),
      loadAllPacksUnified()
    ]);

    setProgress(loadedProgress);
    setTier(loadedProgress.settings.defaultTier || 2);
    setIsOfflineFallback(unified.isOfflineFallback);

    const list = unified.packs.length > 0 ? unified.packs : STARTER_PACKS;
    setPacks(list);

    const savedCurrent =
      list.find((p) => p.id === loadedProgress.settings.lastPackId) || list[0];
    if (savedCurrent) {
      setCurrentPack(savedCurrent);
      triggerSpeculativeNextRandom(
        list,
        savedCurrent.id,
        loadedProgress.settings.lastFilterTemplate,
        loadedProgress.settings.lastFilterTopic
      );
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Apply theme & font size to document root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', progress.settings.theme || 'dark');
    document.documentElement.setAttribute('data-fontsize', progress.settings.fontSize || 'normal');
  }, [progress.settings.theme, progress.settings.fontSize]);

  const handleUpdateSettings = async (partial: Partial<UserSettings>) => {
    const updated = await updateUserSettings(partial);
    setProgress(updated);
  };

  const handleSelectPack = (pack: SpeakPack) => {
    setCurrentPack(pack);
    setActiveTab('practice');
    handleUpdateSettings({ lastPackId: pack.id });
    triggerSpeculativeNextRandom(
      packs,
      pack.id,
      progress.settings.lastFilterTemplate,
      progress.settings.lastFilterTopic
    );
  };

  const handleNextRandomPack = () => {
    const next = consumeSpeculativeNextRandom(
      packs,
      currentPack.id,
      progress.settings.lastFilterTemplate,
      progress.settings.lastFilterTopic
    );
    if (next) {
      setCurrentPack(next);
      setActiveTab('practice');
      handleUpdateSettings({ lastPackId: next.id });
    }
  };

  useEffect(() => {
    musicController.warm();
    return musicController.subscribe(setMusicActive);
  }, []);

  const handleToggleMusic = () => {
    if (musicActive) {
      musicController.stop();
      setMusicActive(false);
      handleUpdateSettings({ musicEnabled: false });
    } else {
      musicController.start(undefined, progress.settings.musicVolume);
      setMusicActive(true);
      handleUpdateSettings({ musicEnabled: true });
    }
  };

  return (
    <div className="app-shell">
      {/* Top Header */}
      <header className="app-header" data-testid="app-header">
        <div className="brand-group" onClick={() => setActiveTab('practice')}>
          <span className="brand-logo" aria-hidden="true">🎙️</span>
          <div>
            <span className="brand-title">SpeakStack</span>
            <span className="brand-sub">Karaoke Phỏng vấn Senior Java</span>
          </div>
          <span
            className={`storage-status-pill ${isOfflineFallback ? 'offline' : 'cloud'}`}
            data-testid="storage-status-pill"
            title={
              isOfflineFallback
                ? 'Đang chạy từ bộ nhớ Offline IndexedDB (0ms latency)'
                : 'Đã đồng bộ Cloud API + IndexedDB'
            }
          >
            {isOfflineFallback ? '⚡ Offline IDB' : '☁️ Cloud + IDB'}
          </span>
        </div>

        {/* Navigation Tabs */}
        <nav className="main-nav" aria-label="Điều hướng chính">
          <button
            type="button"
            className={`nav-btn ${activeTab === 'practice' ? 'active' : ''}`}
            onClick={() => setActiveTab('practice')}
            data-testid="nav-practice-btn"
          >
            🎧 Luyện tập
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
            data-testid="nav-library-btn"
          >
            📚 Thư viện ({packs.length})
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'drills' ? 'active' : ''}`}
            onClick={() => setActiveTab('drills')}
            data-testid="nav-drills-btn"
          >
            🎯 Mock & Drill
          </button>
          <button
            type="button"
            className={`nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
            data-testid="nav-admin-btn"
          >
            🛠️ Admin & Coverage
          </button>
        </nav>

        {/* Quick Header Utilities: Music Ducking, WPM, Font Size, Theme */}
        <div className="header-utils">
          <button
            type="button"
            className={`icon-pill-btn ${musicActive ? 'active' : ''}`}
            onClick={handleToggleMusic}
            title="Nhạc nền tự giảm âm (Ducking) khi nói hoặc nghe TTS"
            aria-label="Bật hoặc tắt nhạc nền"
            data-testid="music-toggle-btn"
          >
            🎵 {musicActive ? 'Nhạc: BẬT' : 'Nhạc'}
          </button>

          <button
            type="button"
            className={`icon-pill-btn ${progress.settings.ttsEnabled ? 'active' : ''}`}
            onClick={() => handleUpdateSettings({ ttsEnabled: !progress.settings.ttsEnabled })}
            title="Bật/tắt giọng đọc TTS"
            aria-label="Bật hoặc tắt giọng đọc TTS"
            data-testid="tts-toggle-btn"
          >
            🔊 {progress.settings.ttsEnabled ? 'TTS: BẬT' : 'TTS: TẮT'}
          </button>

          <button
            type="button"
            className="icon-pill-btn"
            onClick={() =>
              handleUpdateSettings({
                fontSize: progress.settings.fontSize === 'large' ? 'normal' : 'large'
              })
            }
            title="Đổi cỡ chữ"
            aria-label="Đổi cỡ chữ"
            data-testid="fontsize-toggle-btn"
          >
            Aa
          </button>

          <button
            type="button"
            className="icon-pill-btn"
            onClick={() =>
              handleUpdateSettings({
                theme: progress.settings.theme === 'dark' ? 'light' : 'dark'
              })
            }
            title="Đổi giao diện Sáng / Tối"
            aria-label="Đổi giao diện Sáng hoặc Tối"
            data-testid="theme-toggle-btn"
          >
            {progress.settings.theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main className="app-main">
        {activeTab === 'practice' && currentPack && (
          <PracticeStage
            pack={currentPack}
            mode={mode}
            onModeChange={setMode}
            tier={tier}
            onTierChange={(t) => {
              setTier(t);
              handleUpdateSettings({ defaultTier: t });
            }}
            settings={progress.settings}
            onUpdateSettings={handleUpdateSettings}
            onNextRandomPack={handleNextRandomPack}
            onSessionComplete={async (stats) => {
              const updated = await recordPracticeSession({
                packId: currentPack.id,
                ...stats
              });
              setProgress(updated);
            }}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            packs={packs}
            progress={progress}
            selectedTemplate={progress.settings.lastFilterTemplate}
            selectedTopic={progress.settings.lastFilterTopic}
            onChangeFilters={(tmpl, top) => {
              handleUpdateSettings({
                lastFilterTemplate: tmpl,
                lastFilterTopic: top
              });
            }}
            onSelectPack={handleSelectPack}
            onStartRandom={handleNextRandomPack}
          />
        )}

        {activeTab === 'drills' && (
          <DrillsView packs={packs} onSelectPack={handleSelectPack} />
        )}

        {activeTab === 'admin' && (
          <AdminView
            packs={packs}
            progress={progress}
            onRefreshPacks={refreshAllData}
            onSelectPack={handleSelectPack}
          />
        )}
      </main>
    </div>
  );
}
