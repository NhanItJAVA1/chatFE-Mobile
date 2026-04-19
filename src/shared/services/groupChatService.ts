import { api } from "./api";
import type {
    Group,
    GroupMember,
    GroupCreatePayload,
    GroupUpdatePayload,
    GroupSettings,
    GroupResponse,
} from "@/types";

/**
 * Group Chat Service - Manages all group chat related API calls
 * Base endpoints: POST/GET/PUT /v1/groups, /v1/conversations
 */
export class GroupChatService {
    /**
     * Create a new group
     * @param payload - { name, memberIds[], avatarUrl? }
     * @returns Created group with system message
     */
    static async createGroup(payload: GroupCreatePayload): Promise<Group> {
        try {
            const response = await api.post("/groups", payload);
            const data = response.data || response;
            // Backend returns { status, msg, data: { conversation, members, systemMessage } }
            const group = data.data?.conversation || data.conversation;
            if (!group) {
                throw new Error("Invalid response: missing group data");
            }
            return group;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to create group"
            );
        }
    }

    /**
     * Get group info/details
     * @param groupId - Group ID
     */
    static async getGroupInfo(groupId: string): Promise<Group> {
        try {
            const response = await api.get(`/groups/${groupId}/info`);
            const data = response.data || response;
            const group = data.data?.conversation || data.conversation;
            if (!group) {
                throw new Error("Invalid response: missing group data");
            }
            return group;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to fetch group info"
            );
        }
    }

    /**
     * Get group members list
     * @param groupId - Group ID
     * Response format: { data: [...members] } - array directly, not { members: [...] }
     */
    static async getGroupMembers(groupId: string): Promise<GroupMember[]> {
        try {
            const response = await api.get(`/groups/${groupId}/members`);

            // BE returns: { data: [...] } where data is array directly
            const membersData = Array.isArray(response.data)
                ? response.data
                : (Array.isArray(response.data?.data) ? response.data.data : []);

            // Transform BE response to GroupMember type
            // Note: BE doesn't return name/avatar - those come from separate user endpoint
            const members: GroupMember[] = membersData.map((member: any) => ({
                _id: member.id || member._id,
                userId: member.userId,
                name: member.name || "", // Will be empty until user profile loaded
                avatar: member.avatar || "", // Will be empty until user profile loaded
                role: member.role || "member",
                status: member.status || "active",
                joinedAt: member.joinedAt,
            }));

            return members;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to fetch group members"
            );
        }
    }

    /**
     * Get group members with user profile data (name, avatar)
     * @param groupId - Group ID
     * Fetches member list + user profiles for each member to get name/avatar
     */
    static async getGroupMembersWithProfiles(groupId: string): Promise<GroupMember[]> {
        try {
            // Import userService dynamically to avoid circular imports
            const { userService } = await import("./userService");

            // Get members from group endpoint
            const response = await api.get(`/groups/${groupId}/members`);
            const membersData = Array.isArray(response.data)
                ? response.data
                : (Array.isArray(response.data?.data) ? response.data.data : []);

            console.log('[GroupChatService] getGroupMembersWithProfiles start:', {
                groupId,
                membersCount: membersData.length,
            });

            // Enrich members with user profile data (name, avatar)
            const enrichedMembers: GroupMember[] = await Promise.all(
                membersData.map(async (member: any) => {
                    let userProfile: any = null;

                    // Try to fetch user profile for name/avatar
                    if (member.userId) {
                        userProfile = await userService.getUserById(member.userId);
                    }

                    return {
                        _id: member.id || member._id,
                        userId: member.userId,
                        name: userProfile?.displayName || userProfile?.name || "",
                        avatar: userProfile?.avatarUrl || userProfile?.avatar || "",
                        role: member.role || "member",
                        status: member.status || "active",
                        joinedAt: member.joinedAt,
                    };
                })
            );

            return enrichedMembers;
        } catch (error: any) {
            console.error('[GroupChatService] Error fetching members with profiles:', error);
            // Fallback to basic getGroupMembers if enrichment fails
            return this.getGroupMembers(groupId);
        }
    }

    /**
     * Get pending members (requires requireApproval=true)
     * @param groupId - Group ID
     */
    static async getPendingMembers(groupId: string): Promise<GroupMember[]> {
        try {
            const response = await api.get(
                `/groups/${groupId}/members/pending`
            );
            const data = response.data || response;
            const members = data.data?.pendingMembers || [];
            return Array.isArray(members) ? members : [];
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to fetch pending members"
            );
        }
    }

    /**
     * Update group (name, avatarUrl)
     * @param groupId - Group ID
     * @param payload - { name?, avatarUrl? }
     */
    static async updateGroup(
        groupId: string,
        payload: GroupUpdatePayload
    ): Promise<Group> {
        try {
            const response = await api.put(`/groups/${groupId}`, payload);
            const data = response.data || response;
            return data.data || data;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to update group"
            );
        }
    }

    /**
     * Add members to group
     * @param groupId - Group ID
     * @param memberIds - Array of user IDs to add
     */
    static async addMembers(
        groupId: string,
        memberIds: string[]
    ): Promise<GroupMember[]> {
        try {
            const response = await api.post(`/groups/${groupId}/members`, {
                memberIds,
            });
            const data = response.data || response;
            const newMembers = data.data?.newMembers || [];
            return Array.isArray(newMembers) ? newMembers : [];
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to add members"
            );
        }
    }

    /**
     * Remove/kick a member from group
     * @param groupId - Group ID
     * @param userId - User ID to remove
     */
    static async removeMember(groupId: string, userId: string): Promise<void> {
        try {
            await api.delete(`/groups/${groupId}/members/${userId}`);
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to remove member"
            );
        }
    }

    /**
     * Leave group
     * @param groupId - Group ID
     */
    static async leaveGroup(groupId: string): Promise<void> {
        try {
            await api.post(`/groups/${groupId}/leave`, {});
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to leave group"
            );
        }
    }

    /**
     * Set/unset admin
     * @param groupId - Group ID
     * @param targetUserId - User to promote/demote
     * @param isAdmin - True to promote, false to demote
     */
    static async setAdmin(
        groupId: string,
        targetUserId: string,
        isAdmin: boolean
    ): Promise<Group> {
        try {
            const response = await api.post(`/groups/${groupId}/set-admin`, {
                targetUserId,
                isAdmin,
            });
            const data = response.data || response;
            return data.data || data;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to set admin"
            );
        }
    }

    /**
     * Transfer group ownership
     * @param groupId - Group ID
     * @param newOwnerId - New owner user ID
     */
    static async transferOwner(
        groupId: string,
        newOwnerId: string
    ): Promise<Group> {
        try {
            const response = await api.post(
                `/groups/${groupId}/transfer-owner`,
                { newOwnerId }
            );
            const data = response.data || response;
            return data.data || data;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to transfer owner"
            );
        }
    }

    /**
     * Update group settings
     * @param groupId - Group ID
     * @param settings - { allowSendLink?, requireApproval?, allowMemberInvite? }
     */
    static async updateGroupSettings(
        groupId: string,
        settings: Partial<GroupSettings>
    ): Promise<GroupSettings> {
        try {
            const response = await api.patch(
                `/groups/${groupId}/settings`,
                settings
            );
            const data = response.data || response;
            return data.data?.settings || data.settings || settings;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to update settings"
            );
        }
    }

    /**
     * Approve pending member
     * @param groupId - Group ID
     * @param userId - User ID to approve
     */
    static async approveMember(groupId: string, userId: string): Promise<GroupMember> {
        try {
            const response = await api.patch(
                `/groups/${groupId}/members/${userId}/approve`,
                {}
            );
            const data = response.data || response;
            return data.data?.member || data.member;
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to approve member"
            );
        }
    }

    /**
     * Reject pending member
     * @param groupId - Group ID
     * @param userId - User ID to reject
     */
    static async rejectMember(groupId: string, userId: string): Promise<void> {
        try {
            await api.patch(
                `/groups/${groupId}/members/${userId}/reject`,
                {}
            );
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to reject member"
            );
        }
    }

    /**
     * Dissolve/delete group
     * @param groupId - Group ID
     */
    static async dissolveGroup(groupId: string): Promise<void> {
        try {
            await api.delete(`/groups/${groupId}`);
        } catch (error: any) {
            throw new Error(
                error.response?.data?.msg ||
                error.message ||
                "Failed to dissolve group"
            );
        }
    }
}
