import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Edit2,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Save,
  RefreshCw,
  MoreVertical,
  Table as TableIcon,
} from "lucide-react";

/**
 * 🛠️ APP CONFIGURATION
 * Paste your credentials from the Google Cloud Console here.
 */
const CONFIG = {
  API_KEY: "", // Paste your API Key here
  CLIENT_ID: "", // Paste your OAuth Client ID here
};

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOC =
  "https://sheets.googleapis.com/$discovery/rest?version=v4";

const App = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheets, setSheets] = useState([]);
  const [currentSheet, setCurrentSheet] = useState(null);
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingItem, setEditingItem] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const tokenClientRef = useRef(null);

  useEffect(() => {
    let gapiLoaded = false;
    let gisLoaded = false;

    const maybeInitClient = async () => {
      if (gapiLoaded && gisLoaded && window.gapi) {
        window.gapi.load("client", async () => {
          try {
            await window.gapi.client.init({
              apiKey: CONFIG.API_KEY,
              discoveryDocs: [DISCOVERY_DOC],
            });
          } catch (err) {
            console.error("GAPI init error:", err);
          }
        });
      }
    };

    const loadScripts = () => {
      // 🎨 Inject Tailwind CSS for instant styling in Sandbox environments
      if (!document.getElementById("tailwind-cdn")) {
        const twScript = document.createElement("script");
        twScript.id = "tailwind-cdn";
        twScript.src = "https://cdn.tailwindcss.com";
        document.head.appendChild(twScript);
      }

      // Load GAPI
      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        gapiLoaded = true;
        maybeInitClient();
      };
      document.body.appendChild(script);

      // Load GIS (Identity Services)
      const gisScript = document.createElement("script");
      gisScript.src = "https://accounts.google.com/gsi/client";
      gisScript.async = true;
      gisScript.defer = true;
      gisScript.onload = () => {
        gisLoaded = true;
        initGisClient();
        maybeInitClient();
      };
      document.body.appendChild(gisScript);
    };

    loadScripts();
  }, []);

  const initGisClient = () => {
    if (window.google && window.google.accounts && CONFIG.CLIENT_ID) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse.error !== undefined) throw tokenResponse;
          setIsSignedIn(true);
          const currentId = document.getElementById("ss-id-input")?.value;
          if (currentId) fetchSpreadsheetData(currentId);
        },
      });
    }
  };

  const handleAuth = () => {
    if (!CONFIG.CLIENT_ID || !CONFIG.API_KEY) {
      showStatus(
        "Please enter your API Key and Client ID in the code first.",
        "error"
      );
      return;
    }

    if (!tokenClientRef.current) initGisClient();

    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: "consent" });
    } else {
      showStatus("Google Auth script still loading...", "error");
    }
  };

  const showStatus = (msg, type = "info") => {
    setStatusMessage({ msg, type });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const fetchSpreadsheetData = async (id) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: id,
      });
      const sheetsData = response.result.sheets.map((s) => s.properties);
      setSheets(sheetsData);
      if (sheetsData.length > 0) {
        selectSheet(sheetsData[0], id);
      }
    } catch (err) {
      showStatus(
        "Error loading spreadsheet. Check ID and permissions.",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectSheet = async (sheetProps, id = spreadsheetId) => {
    setCurrentSheet(sheetProps);
    setIsLoading(true);
    try {
      const response = await window.gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${sheetProps.title}!A:Z`,
      });

      const rows = response.result.values || [];
      if (rows.length === 0) {
        setItems([]);
        return;
      }

      const headers = rows[0];
      const dataRows = rows
        .slice(1)
        .map((row, index) => {
          const obj = { _rowId: index + 2 };
          headers.forEach((h, i) => {
            obj[h] = row[i] || "";
          });
          return obj;
        })
        .filter((item) => {
          const keys = Object.keys(item).filter((k) => k !== "_rowId");
          const firstValue = item[keys[0]];
          return typeof firstValue === "string" && !firstValue.startsWith("_");
        });

      setItems(dataRows);
    } catch (err) {
      showStatus("Error fetching sheet rows.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const lowerQuery = searchQuery.toLowerCase();
    return items.filter((item) =>
      Object.values(item).some((val) =>
        String(val).toLowerCase().includes(lowerQuery)
      )
    );
  }, [items, searchQuery]);

  const handleSaveItem = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const updatedValues = [];
    const headers = Object.keys(items[0] || {}).filter((k) => k !== "_rowId");

    headers.forEach((h) => updatedValues.push(formData.get(h)));

    setIsLoading(true);
    try {
      if (isAddingNew) {
        await window.gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheetId,
          range: `${currentSheet.title}!A1`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [updatedValues] },
        });
        showStatus("Item added to Google Sheets!", "success");
      } else {
        await window.gapi.client.sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `${currentSheet.title}!A${editingItem._rowId}`,
          valueInputOption: "USER_ENTERED",
          resource: { values: [updatedValues] },
        });
        showStatus("Item updated in Google Sheets!", "success");
      }
      setEditingItem(null);
      setIsAddingNew(false);
      selectSheet(currentSheet);
    } catch (err) {
      showStatus("Failed to save changes.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
              <TableIcon size={40} />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-center text-slate-900 mb-2">
            PriceList Manager
          </h1>
          <p className="text-center text-slate-500 mb-8">
            Edit your prices live on Google Sheets.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Spreadsheet ID
              </label>
              <input
                id="ss-id-input"
                type="text"
                placeholder="1X-abc123..."
                className="w-full px-4 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
              />
            </div>
            <button
              onClick={handleAuth}
              disabled={!spreadsheetId}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-[0.98] transition-all shadow-lg shadow-blue-100"
            >
              Sign in with Google
            </button>
          </div>

          {statusMessage && (
            <p className="mt-4 text-xs text-center text-red-500 font-medium">
              {statusMessage.msg}
            </p>
          )}

          <div className="mt-8 text-[10px] text-slate-400 text-center leading-relaxed">
            Ensure your <b>API Key</b> and <b>Client ID</b> are set in the code.
            <br />
            Rows starting with{" "}
            <span className="font-mono bg-slate-100 px-1 rounded text-slate-600">
              _
            </span>{" "}
            will be hidden.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white text-slate-900 overflow-hidden font-sans">
      <aside
        className={`${
          isSidebarOpen ? "w-64" : "w-0"
        } bg-slate-50 border-r border-slate-200 flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <TableIcon size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight">PriceManager</span>
        </div>

        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">
            Sheets
          </div>
          {sheets.map((sheet) => (
            <button
              key={sheet.sheetId}
              onClick={() => selectSheet(sheet)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group ${
                currentSheet?.sheetId === sheet.sheetId
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FileText
                size={18}
                className={
                  currentSheet?.sheetId === sheet.sheetId
                    ? "text-blue-600"
                    : "text-slate-400 group-hover:text-slate-600"
                }
              />
              <span className="truncate">{sheet.title}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <button
            onClick={() => setIsSignedIn(false)}
            className="flex items-center gap-3 w-full px-3 py-2 text-sm text-slate-600 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="relative flex-1 max-w-2xl">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder={`Search ${currentSheet?.title || "all rows"}...`}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500/20 text-sm transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 ml-4">
            <button
              onClick={() => selectSheet(currentSheet)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
              title="Refresh data"
            >
              <RefreshCw
                size={18}
                className={isLoading ? "animate-spin" : ""}
              />
            </button>
            <button
              onClick={() => {
                setIsAddingNew(true);
                setEditingItem({});
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-100"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add Item</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 bg-slate-50/50">
          {statusMessage && (
            <div
              className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-4 ${
                statusMessage.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-100"
                  : "bg-green-50 text-green-700 border border-green-100"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  statusMessage.type === "error" ? "bg-red-500" : "bg-green-500"
                }`}
              />
              {statusMessage.msg}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {items.length > 0 ? (
                    Object.keys(items[0])
                      .filter((k) => k !== "_rowId")
                      .map((header) => (
                        <th
                          key={header}
                          className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"
                        >
                          {header}
                        </th>
                      ))
                  ) : (
                    <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                      No Data
                    </th>
                  )}
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-blue-50/30 transition-colors group"
                  >
                    {Object.entries(item)
                      .filter(([k]) => k !== "_rowId")
                      .map(([key, val], i) => (
                        <td
                          key={i}
                          className="px-6 py-4 text-sm text-slate-700"
                        >
                          {val || (
                            <span className="text-slate-300 italic">Empty</span>
                          )}
                        </td>
                      ))}
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => {
                          setIsAddingNew(false);
                          setEditingItem(item);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all inline-flex items-center gap-2"
                      >
                        <Edit2 size={16} />
                        <span className="text-xs font-medium">Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && !isLoading && (
                  <tr>
                    <td
                      colSpan="100%"
                      className="px-6 py-20 text-center text-slate-400 italic"
                    >
                      No results found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {editingItem !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setEditingItem(null)}
          />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                {isAddingNew ? (
                  <Plus className="text-blue-600" />
                ) : (
                  <Edit2 className="text-blue-600" />
                )}
                {isAddingNew ? "Add New Item" : "Edit Item"}
              </h2>
              <button
                onClick={() => setEditingItem(null)}
                className="p-2 hover:bg-slate-100 rounded-full transition-all"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-8 space-y-5">
              <div className="grid gap-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                {(items.length > 0
                  ? Object.keys(items[0])
                  : ["Item Name", "Price", "Description"]
                )
                  .filter((k) => k !== "_rowId")
                  .map((header) => (
                    <div key={header}>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">
                        {header}
                      </label>
                      <input
                        name={header}
                        defaultValue={isAddingNew ? "" : editingItem[header]}
                        className="w-full px-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      />
                    </div>
                  ))}
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 py-3 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                >
                  <Save size={18} />
                  {isAddingNew ? "Add Item" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
