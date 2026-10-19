"use client";

import React, { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Search,
  Filter,
  X,
  Shield,
  ShieldAlert,
  ArrowLeft,
  RotateCcw,
  ChevronDown,
} from "lucide-react";

import styles from "./styles/ViewMember.module.scss";
import AddMemberForm from "../../Form/MemberForm/AddMemberForm";
import AuthContext from "../../../../../context/AuthContext";
import { api } from "../../../../../services";
import { Alert, ComponentLoading } from "../../../../../microInteraction";
import TeamCard from "../../../../../components/TeamCard/TeamCard";
import type { Member } from "@/src/types/member";

/** Team rows always carry an id, a name and a role. */
type TeamRow = Member & { id: string; name: string; access: string; email?: string };

const isBoardRole = (access: string) => {
  if (!access) return false;
  return (
    access.startsWith("DIRECTOR_") ||
    access.startsWith("DEPUTY_") ||
    access === "PRESIDENT" ||
    access === "VICEPRESIDENT"
  );
};

const getMemberDepartment = (access: string) => {
  if (!access) return "General";
  const acc = access.toUpperCase();
  if (acc.includes("TECHNICAL")) return "Technical";
  if (acc.includes("CREATIVE")) return "Creative";
  if (acc.includes("MARKETING")) return "Marketing";
  if (acc.includes("OPERATIONS")) return "Operations";
  if (acc.includes("PR_AND_FINANCE")) return "PR & Finance";
  if (acc.includes("HUMAN_RESOURCE")) return "Human Resource";
  if (acc === "PRESIDENT" || acc === "VICEPRESIDENT" || acc === "VICE_PRESIDENT") {
    return "Executive Board";
  }
  if (acc === "ALUMNI") return "Alumni";
  if (acc === "EX_MEMBER") return "Ex-Member";
  return "General";
};

const getMemberRoleTier = (access: string) => {
  if (!access) return "executive";
  const acc = access.toUpperCase();
  if (acc === "PRESIDENT") {
    return "president";
  }
  if (acc === "VICEPRESIDENT" || acc === "VICE_PRESIDENT") {
    return "vicepresident";
  }
  if (acc.startsWith("DIRECTOR_")) {
    return "director";
  }
  if (acc.startsWith("DEPUTY_DIRECTOR_") || acc.startsWith("DEPUTY_")) {
    return "deputy_director";
  }
  if (acc.startsWith("SENIOR_EXECUTIVE_") || acc.startsWith("SENIOR_")) {
    return "senior_executive";
  }
  if (acc === "ALUMNI") {
    return "alumni";
  }
  if (acc === "EX_MEMBER") {
    return "ex_member";
  }
  return "executive";
};

const ROLE_DEFINITIONS = [
  { id: "all", label: "All Roles" },
  { id: "president", label: "President" },
  { id: "vicepresident", label: "Vice President" },
  { id: "director", label: "Director" },
  { id: "deputy_director", label: "Deputy Director" },
  { id: "senior_executive", label: "Senior Executive" },
  { id: "executive", label: "Executive" },
  { id: "alumni", label: "Alumni" },
  { id: "ex_member", label: "Ex-Member" },
] as const;

export default function ViewMember() {
  const router = useRouter();
  const authCtx = useContext(AuthContext);

  const [members, setMembers] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedRole, setSelectedRole] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // View state: "roster" or "form"
  const [activeTab, setActiveTab] = useState<"roster" | "form">("roster");
  const [editingMember, setEditingMember] = useState<TeamRow | null>(null);

  // Custom styles for legacy TeamCard flip card component
  const customStyles = {
    teamMember: styles.teamMemberCustom,
    teamMemberBackh5: styles.teamMemberBackh5Custom,
    socialLinksa: styles.socialLinksaCustom,
    button: styles.buttonCustom,
    knowPara: styles.knowParaCustom,
    updatebtn: styles.updatebtnCustom,
  };

  const fetchMemberData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/api/user/fetchTeam");
      const fetchedMembers = response.data?.data;
      setMembers(Array.isArray(fetchedMembers) ? fetchedMembers : []);
    } catch (error) {
      console.error("Error fetching member data:", error);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemberData();
  }, [fetchMemberData]);

  // Build department dropdown options dynamically from active roster
  const departmentOptions = useMemo(() => {
    const deptSet = new Set<string>();
    members.forEach((m) => {
      const dept = getMemberDepartment(m.access);
      if (dept && dept !== "General" && dept !== "Executive Board") {
        deptSet.add(dept);
      }
    });
    return Array.from(deptSet).sort();
  }, [members]);

  // Counts for dropdown labels
  const boardCount = useMemo(() => {
    return members.filter((m) => isBoardRole(m.access)).length;
  }, [members]);

  // Role options for 2nd dropdown
  const roleOptions = useMemo(() => {
    const counts: Record<string, number> = { all: members.length };
    members.forEach((m) => {
      const tier = getMemberRoleTier(m.access);
      counts[tier] = (counts[tier] || 0) + 1;
    });

    return ROLE_DEFINITIONS
      .map((r) => ({ id: r.id, label: r.label, count: counts[r.id] || 0 }))
      .filter((r) => (r.id !== "alumni" && r.id !== "ex_member") || r.count > 0);
  }, [members]);

  // Filtered & Sorted Members
  const filteredMembers = useMemo(() => {
    let result = [...members];

    // 1. Department filter
    if (selectedDept !== "all") {
      if (selectedDept === "board") {
        result = result.filter((m) => isBoardRole(m.access));
      } else {
        result = result.filter(
          (m) => getMemberDepartment(m.access).toLowerCase() === selectedDept.toLowerCase()
        );
      }
    }

    // 2. Role tier filter
    if (selectedRole !== "all") {
      result = result.filter((m) => getMemberRoleTier(m.access) === selectedRole);
    }

    // 3. Search query filter (name, email, designation, access)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((m) => {
        const nameMatch = m.name?.toLowerCase().includes(q);
        const emailMatch = m.email?.toLowerCase().includes(q);
        const accessMatch = m.access?.toLowerCase().includes(q);
        const extra = typeof m.extra === "string" ? JSON.parse(m.extra || "{}") : m.extra || {};
        const designationMatch = extra.designation?.toLowerCase().includes(q);
        return Boolean(nameMatch || emailMatch || accessMatch || designationMatch);
      });
    }

    // 4. Default alphabetical sort
    result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return result;
  }, [members, selectedDept, selectedRole, searchQuery]);

  // Handle edit action on a member card
  const handleEditMember = (member: TeamRow) => {
    authCtx.memberData = member;
    authCtx.croppedImageFile = null;
    setEditingMember(member);
    setActiveTab("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle add new member button click
  const handleAddNewMember = () => {
    authCtx.memberData = null;
    authCtx.croppedImageFile = null;
    setEditingMember(null);
    setActiveTab("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Return to roster view
  const handleBackToRoster = () => {
    authCtx.memberData = null;
    authCtx.croppedImageFile = null;
    setEditingMember(null);
    setActiveTab("roster");
  };

  // Form submit success callback
  const handleFormSuccess = () => {
    fetchMemberData();
    handleBackToRoster();
  };

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedDept("all");
    setSelectedRole("all");
  }, []);

  // Execute member removal (called from TeamCard after user confirms)
  const handleRemove = async (member: TeamRow) => {
    try {
      const response = await api.delete(`/api/user/deleteMember/${member.id}`);

      if (response.status === 200 || response.status === 201) {
        Alert({
          type: "success",
          message: `${member.name} has been removed from members.`,
          position: "bottom-right",
          duration: 3500,
        });
        const removedId = response.data?.user?.id || member.id;
        setMembers((prev) => prev.filter((m) => m.id !== removedId));
      }
    } catch (error) {
      console.error("Error removing member:", error);
      Alert({
        type: "error",
        message: "Failed to remove member. Please try again.",
        position: "bottom-right",
        duration: 4000,
      });
    }
  };

  // Defense-in-depth: If user profile is loaded and they are not Admin, block view
  if (!authCtx.isLoading && authCtx.user?.access && authCtx.user.access !== "ADMIN") {
    return (
      <div className={styles.container}>
        <div className={styles.unauthorizedCard}>
          <ShieldAlert size={52} className={styles.unauthorizedIcon} />
          <h2>Admin Access Required</h2>
          <p>
            The members management console is strictly restricted to club administrators.
          </p>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => router.push("/profile")}
          >
            Return to Profile
          </button>
        </div>
      </div>
    );
  }

  const isFiltered =
    searchQuery.trim() !== "" || selectedDept !== "all" || selectedRole !== "all";

  return (
    <div className={styles.container}>
      {/* Page Header */}
      {activeTab === "roster" ? (
        <div className={styles.headerSection}>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>
              Manage <span>Members</span>
            </h1>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleAddNewMember}
            >
              <UserPlus size={16} />
              <span>Add Member</span>
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.formTopBar}>
          <button
            type="button"
            className={styles.backLink}
            onClick={handleBackToRoster}
          >
            <ArrowLeft size={14} />
            <span>Back to Members</span>
          </button>
          <h1 className={styles.title}>
            {editingMember ? (
              <>
                Edit <span>{editingMember.name}</span>
              </>
            ) : (
              <>
                Add <span>New Member</span>
              </>
            )}
          </h1>
        </div>
      )}

      {/* Main Content: Form View vs Roster View */}
      {activeTab === "form" ? (
        <div className={styles.formSection}>
          <AddMemberForm
            onSuccess={handleFormSuccess}
            onCancel={handleBackToRoster}
          />
        </div>
      ) : (
        <>
          {/* Controls Toolbar with Dropdown Filters */}
          <div className={styles.toolbarCard}>
            <div className={styles.toolbarRow}>
              {/* Search Bar */}
              <div className={styles.searchBox}>
                <Search size={16} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search by name, email, or designation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className={styles.clearSearchBtn}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Dropdown Filters */}
              <div className={styles.filterControls}>
                {/* Department / Domain Select Filter */}
                <div className={styles.selectWrapper}>
                  <Filter size={15} className={styles.selectIcon} />
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className={styles.selectDropdown}
                    aria-label="Filter by department"
                  >
                    <option value="all">All Departments ({members.length})</option>
                    <option value="board">Board Members ({boardCount})</option>
                    {departmentOptions.map((dept) => {
                      const count = members.filter(
                        (m) => getMemberDepartment(m.access).toLowerCase() === dept.toLowerCase()
                      ).length;
                      return (
                        <option key={dept} value={dept}>
                          {dept} ({count})
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={14} className={styles.selectChevron} />
                </div>

                {/* Role / Hierarchy Select Filter */}
                <div className={styles.selectWrapper}>
                  <Shield size={15} className={styles.selectIcon} />
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className={styles.selectDropdown}
                    aria-label="Filter by role"
                  >
                    {roleOptions.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.label} ({role.count})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className={styles.selectChevron} />
                </div>
              </div>
            </div>

            {/* Results Summary Row */}
            <div className={styles.summaryRow}>
              <span>
                Showing <strong>{filteredMembers.length}</strong> of <strong>{members.length}</strong> members
                {selectedDept !== "all" && ` in ${selectedDept === "board" ? "Board" : selectedDept}`}
                {selectedRole !== "all" &&
                  ` • ${roleOptions.find((r) => r.id === selectedRole)?.label || selectedRole}`}
              </span>

              {isFiltered && (
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={resetFilters}
                >
                  <RotateCcw size={12} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>
          {/* Members Roster Grid */}
          {loading ? (
            <ComponentLoading />
          ) : filteredMembers.length === 0 ? (
            <div className={styles.emptyState}>
              <Users size={42} style={{ color: "var(--text-tertiary)" }} />
              <h3>No members found</h3>
              <p>
                {searchQuery || selectedDept !== "all" || selectedRole !== "all"
                  ? "No team members matched your active search, department, or role filter."
                  : "No team members have been added to the roster yet."}
              </p>
              {isFiltered && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={resetFilters}
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className={styles.teamGrid}>
              {filteredMembers.map((member) => (
                <TeamCard
                  key={member.id}
                  member={member}
                  customStyles={customStyles}
                  onUpdate={() => handleEditMember(member)}
                  onRemove={() => handleRemove(member)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Alert />
    </div>
  );
}
