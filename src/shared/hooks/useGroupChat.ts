import { useState, useCallback, useEffect, useRef } from "react";
import {
    GroupChatService,
    SocketService,
    type GroupEventData,
    type GroupMemberEvent,
    type GroupAdminEvent,
    type GroupOwnerTransferEvent,
} from "../services";
import {
    Group,
    GroupMember,
    GroupSettings,
    GroupCreatePayload,
    GroupUpdatePayload,
} from "@/types";

export interface UseGroupChatState {
    group: Group | null;
    members: GroupMember[];
    pendingMembers: GroupMember[];
    settings: GroupSettings | null;
    isLoading: boolean;
    error: string | null;
}

export interface UseGroupChatActions {
    // Group CRUD
    createGroup: (payload: GroupCreatePayload) => Promise<Group>;
    loadGroupInfo: (groupId: string) => Promise<void>;
    updateGroup: (groupId: string, payload: GroupUpdatePayload) => Promise<void>;
    dissolveGroup: (groupId: string) => Promise<void>;

    // Members
    loadMembers: (groupId: string) => Promise<void>;
    addMembers: (groupId: string, memberIds: string[]) => Promise<void>;
    removeMember: (groupId: string, userId: string) => Promise<void>;
    leaveGroup: (groupId: string) => Promise<void>;

    // Pending approval
    loadPendingMembers: (groupId: string) => Promise<void>;
    approveMember: (groupId: string, userId: string) => Promise<void>;
    rejectMember: (groupId: string, userId: string) => Promise<void>;

    // Admin/Owner
    setAdmin: (
        groupId: string,
        userId: string,
        isAdmin: boolean
    ) => Promise<void>;
    transferOwner: (groupId: string, newOwnerId: string) => Promise<void>;

    // Settings
    updateSettings: (groupId: string, settings: Partial<GroupSettings>) => Promise<void>;

    // Listeners
    setupGroupListeners: () => void;
    cleanupGroupListeners: () => void;
}

export interface UseGroupChatReturn {
    state: UseGroupChatState;
    actions: UseGroupChatActions;
}

/**
 * Custom hook for managing group chat functionality
 */
export const useGroupChat = (): UseGroupChatReturn => {
    // State
    const [state, setState] = useState<UseGroupChatState>({
        group: null,
        members: [],
        pendingMembers: [],
        settings: null,
        isLoading: false,
        error: null,
    });

    const listenerSetupRef = useRef(false);

    // ========================================================================
    // GROUP CRUD OPERATIONS
    // ========================================================================

    const createGroup = useCallback(
        async (payload: GroupCreatePayload): Promise<Group> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const group = await GroupChatService.createGroup(payload);
                setState((prev) => ({ ...prev, group, isLoading: false }));
                return group;
            } catch (err: any) {
                const error = err.message || "Failed to create group";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const loadGroupInfo = useCallback(async (groupId: string): Promise<void> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));
            const group = await GroupChatService.getGroupInfo(groupId);
            setState((prev) => ({ ...prev, group, isLoading: false }));
        } catch (err: any) {
            const error = err.message || "Failed to load group info";
            setState((prev) => ({ ...prev, error, isLoading: false }));
            throw err;
        }
    }, []);

    const updateGroup = useCallback(
        async (groupId: string, payload: GroupUpdatePayload): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const updated = await GroupChatService.updateGroup(groupId, payload);
                setState((prev) => ({ ...prev, group: updated, isLoading: false }));
            } catch (err: any) {
                const error = err.message || "Failed to update group";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const dissolveGroup = useCallback(async (groupId: string): Promise<void> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));
            await GroupChatService.dissolveGroup(groupId);
            setState((prev) => ({
                ...prev,
                group: null,
                members: [],
                settings: null,
                isLoading: false,
            }));
        } catch (err: any) {
            const error = err.message || "Failed to dissolve group";
            setState((prev) => ({ ...prev, error, isLoading: false }));
            throw err;
        }
    }, []);

    // ========================================================================
    // MEMBER MANAGEMENT
    // ========================================================================

    const loadMembers = useCallback(async (groupId: string): Promise<void> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));
            const members = await GroupChatService.getGroupMembers(groupId);
            setState((prev) => ({ ...prev, members, isLoading: false }));
        } catch (err: any) {
            const error = err.message || "Failed to load members";
            setState((prev) => ({ ...prev, error, isLoading: false }));
            throw err;
        }
    }, []);

    const addMembers = useCallback(
        async (groupId: string, memberIds: string[]): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const newMembers = await GroupChatService.addMembers(
                    groupId,
                    memberIds
                );
                setState((prev) => ({
                    ...prev,
                    members: [...prev.members, ...newMembers],
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to add members";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const removeMember = useCallback(
        async (groupId: string, userId: string): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                await GroupChatService.removeMember(groupId, userId);
                setState((prev) => ({
                    ...prev,
                    members: prev.members.filter((m) => m.userId !== userId),
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to remove member";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const leaveGroup = useCallback(async (groupId: string): Promise<void> => {
        try {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));
            await GroupChatService.leaveGroup(groupId);
            setState((prev) => ({
                ...prev,
                group: null,
                members: [],
                isLoading: false,
            }));
        } catch (err: any) {
            const error = err.message || "Failed to leave group";
            setState((prev) => ({ ...prev, error, isLoading: false }));
            throw err;
        }
    }, []);

    // ========================================================================
    // PENDING MEMBERS (APPROVAL FLOW)
    // ========================================================================

    const loadPendingMembers = useCallback(
        async (groupId: string): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const pendingMembers = await GroupChatService.getPendingMembers(
                    groupId
                );
                setState((prev) => ({ ...prev, pendingMembers, isLoading: false }));
            } catch (err: any) {
                const error = err.message || "Failed to load pending members";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const approveMember = useCallback(
        async (groupId: string, userId: string): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const approvedMember =
                    await GroupChatService.approveMember(groupId, userId);
                setState((prev) => ({
                    ...prev,
                    pendingMembers: prev.pendingMembers.filter(
                        (m) => m.userId !== userId
                    ),
                    members: [...prev.members, approvedMember],
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to approve member";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const rejectMember = useCallback(
        async (groupId: string, userId: string): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                await GroupChatService.rejectMember(groupId, userId);
                setState((prev) => ({
                    ...prev,
                    pendingMembers: prev.pendingMembers.filter(
                        (m) => m.userId !== userId
                    ),
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to reject member";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    // ========================================================================
    // ADMIN / OWNER OPERATIONS
    // ========================================================================

    const setAdmin = useCallback(
        async (groupId: string, userId: string, isAdmin: boolean): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const updated = await GroupChatService.setAdmin(
                    groupId,
                    userId,
                    isAdmin
                );
                setState((prev) => ({
                    ...prev,
                    group: updated,
                    members: prev.members.map((m) =>
                        m.userId === userId ? { ...m, role: isAdmin ? "admin" : "member" } : m
                    ),
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to set admin";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    const transferOwner = useCallback(
        async (groupId: string, newOwnerId: string): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const updated = await GroupChatService.transferOwner(
                    groupId,
                    newOwnerId
                );
                setState((prev) => ({
                    ...prev,
                    group: updated,
                    members: prev.members.map((m) =>
                        m.userId === newOwnerId
                            ? { ...m, role: "owner" }
                            : m.role === "owner"
                                ? { ...m, role: "admin" }
                                : m
                    ),
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to transfer owner";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    // ========================================================================
    // SETTINGS
    // ========================================================================

    const updateSettings = useCallback(
        async (groupId: string, settings: Partial<GroupSettings>): Promise<void> => {
            try {
                setState((prev) => ({ ...prev, isLoading: true, error: null }));
                const updated = await GroupChatService.updateGroupSettings(
                    groupId,
                    settings
                );
                setState((prev) => ({
                    ...prev,
                    settings: updated,
                    isLoading: false,
                }));
            } catch (err: any) {
                const error = err.message || "Failed to update settings";
                setState((prev) => ({ ...prev, error, isLoading: false }));
                throw err;
            }
        },
        []
    );

    // ========================================================================
    // SOCKET EVENT LISTENERS
    // ========================================================================

    const setupGroupListeners = useCallback(() => {
        if (listenerSetupRef.current) return;
        listenerSetupRef.current = true;

        // Listen for members added
        SocketService.onGroupMembersAdded((data: GroupMemberEvent) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    members: [
                        ...prev.members,
                        ...(data.newMembers || []).filter(
                            (nm: any) => !prev.members.find((m) => m.userId === nm.userId)
                        ),
                    ],
                };
            });
        });

        // Listen for member removed
        SocketService.onGroupMemberRemoved((data: GroupMemberEvent) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    members: prev.members.filter(
                        (m) => m.userId !== data.removedUserId
                    ),
                };
            });
        });

        // Listen for group updated
        SocketService.onGroupUpdated((data: GroupEventData) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    group: { ...prev.group!, ...data.data },
                };
            });
        });

        // Listen for admin changed
        SocketService.onGroupAdminChanged((data: GroupAdminEvent) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    members: prev.members.map((m) =>
                        m.userId === data.targetUserId
                            ? { ...m, role: data.isAdmin ? "admin" : "member" }
                            : m
                    ),
                };
            });
        });

        // Listen for owner transferred
        SocketService.onGroupOwnerTransferred((data: GroupOwnerTransferEvent) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    group: { ...prev.group!, ownerId: data.newOwnerId },
                    members: prev.members.map((m) =>
                        m.userId === data.newOwnerId
                            ? { ...m, role: "owner" }
                            : m.userId === data.oldOwnerId
                                ? { ...m, role: "admin" }
                                : m
                    ),
                };
            });
        });

        // Listen for member approved
        SocketService.onGroupMemberApproved((data: GroupMemberEvent) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    pendingMembers: prev.pendingMembers.filter(
                        (m) => m.userId !== data.userId
                    ),
                    members: data.member
                        ? [...prev.members, data.member]
                        : prev.members,
                };
            });
        });

        // Listen for member rejected
        SocketService.onGroupMemberRejected((data: GroupMemberEvent) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    pendingMembers: prev.pendingMembers.filter(
                        (m) => m.userId !== data.userId
                    ),
                };
            });
        });

        // Listen for settings updated
        SocketService.onGroupSettingsUpdated((data: GroupEventData) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    settings: data.settings || prev.settings,
                };
            });
        });

        // Listen for group dissolved
        SocketService.onGroupDissolved((data: GroupEventData) => {
            if (!data?.conversationId) return;
            setState((prev) => {
                if (prev.group?._id !== data.conversationId) return prev;
                return {
                    ...prev,
                    group: null,
                    members: [],
                    settings: null,
                };
            });
        });
    }, []);

    const cleanupGroupListeners = useCallback(() => {
        listenerSetupRef.current = false;
        SocketService.offAllGroupEvents();
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupGroupListeners();
        };
    }, [cleanupGroupListeners]);

    return {
        state,
        actions: {
            createGroup,
            loadGroupInfo,
            updateGroup,
            dissolveGroup,
            loadMembers,
            addMembers,
            removeMember,
            leaveGroup,
            loadPendingMembers,
            approveMember,
            rejectMember,
            setAdmin,
            transferOwner,
            updateSettings,
            setupGroupListeners,
            cleanupGroupListeners,
        },
    };
};
