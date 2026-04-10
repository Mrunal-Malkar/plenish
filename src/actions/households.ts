'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: 'admin' | 'member';
  status: 'pending' | 'active';
  created_at: string;
}

export interface HouseholdWithMembers extends Household {
  members: (HouseholdMember & { display_name: string | null })[];
  currentUserRole: 'admin' | 'member';
}

export interface HouseholdMemberSimple {
  user_id: string;
  display_name: string;
}

export interface PendingInvitation {
  household_id: string;
  household_name: string;
  invited_by: string;
  created_at: string;
}

async function assertIsAdmin(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  message = 'Only household admins can perform this action.',
): Promise<void> {
  const { data } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .maybeSingle();
  if (!data) throw new Error(message);
}

export async function createHousehold(name: string): Promise<{ success: true; household: Household }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  // Prevent creating a second household while already an active member
  const { data: existing } = await supabase
    .from('household_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (existing) throw new Error('You already belong to a household.');

  const householdId = crypto.randomUUID();

  const { error: hError } = await supabase
    .from('households')
    .insert({ id: householdId, name: name.trim(), created_by: user.id });

  if (hError) throw new Error('Failed to create household.');

  const { error: mError } = await supabase
    .from('household_members')
    .insert({
      household_id: householdId,
      user_id: user.id,
      role: 'admin',
      status: 'active',
    });

  if (mError) {
    await supabase.from('households').delete().eq('id', householdId);
    throw new Error('Failed to create household membership.');
  }

  // Fetch after member row exists so the RLS policy (is_household_member) passes
  const { data: household, error: fetchError } = await supabase
    .from('households')
    .select()
    .eq('id', householdId)
    .single();

  if (fetchError || !household) throw new Error('Failed to create household.');

  revalidatePath('/dashboard');
  return { success: true, household: household as Household };
}

export async function inviteToHousehold(
  householdId: string,
  email: string,
): Promise<{ success: true; member: HouseholdMember }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  await assertIsAdmin(supabase, householdId, user.id, 'Only household admins can send invitations.');

  // Check if a user with this email already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  const newMemberData: Record<string, unknown> = {
    household_id: householdId,
    invited_email: email,
    role: 'member',
    status: 'pending',
  };

  if (existingUser) {
    newMemberData.user_id = existingUser.id;
  }

  const { data: member, error: insertError } = await supabase
    .from('household_members')
    .insert(newMemberData)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === '23505') throw new Error('This user already has a pending or active invitation.');
    throw new Error('Failed to send invitation.');
  }

  revalidatePath('/dashboard');
  return { success: true, member: member as HouseholdMember };
}

export async function respondToInvitation(
  householdId: string,
  accept: boolean,
): Promise<{ success: true }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  // Find the pending invitation (by user_id or invited_email)
  const { data: invite } = await supabase
    .from('household_members')
    .select('id, invited_email')
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .or(`user_id.eq.${user.id},invited_email.eq.${user.email}`)
    .maybeSingle();

  if (!invite) throw new Error('No pending invitation found.');

  if (accept) {
    const { error } = await supabase
      .from('household_members')
      .update({ status: 'active', user_id: user.id })
      .eq('id', invite.id);

    if (error) throw new Error('Failed to accept invitation.');
  } else {
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('id', invite.id);

    if (error) throw new Error('Failed to decline invitation.');
  }

  revalidatePath('/dashboard');
  return { success: true };
}

export async function leaveHousehold(householdId: string): Promise<{ success: true }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', user.id);

  if (error) throw new Error('Failed to leave household.');

  // Admin transfer and household cleanup is handled by the DB trigger
  revalidatePath('/dashboard');
  return { success: true };
}

export async function removeMember(
  householdId: string,
  userId: string,
): Promise<{ success: true }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  if (userId === user.id) throw new Error('Use leaveHousehold to leave the household.');

  await assertIsAdmin(supabase, householdId, user.id, 'Only household admins can remove members.');

  const { error } = await supabase
    .from('household_members')
    .delete()
    .eq('household_id', householdId)
    .eq('user_id', userId);

  if (error) throw new Error('Failed to remove member.');

  revalidatePath('/dashboard');
  return { success: true };
}

export async function getHousehold(): Promise<HouseholdWithMembers | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return null;

  const [householdResult, membersResult] = await Promise.all([
    supabase
      .from('households')
      .select('*')
      .eq('id', membership.household_id)
      .single(),
    supabase
      .from('household_members')
      .select('*, users(email)')
      .eq('household_id', membership.household_id)
      .order('created_at', { ascending: true }),
  ]);

  if (householdResult.error || !householdResult.data) return null;

  const members = (membersResult.data ?? []).map((m) => ({
    ...(m as HouseholdMember),
    display_name: (m as { users?: { email?: string } }).users?.email ?? m.invited_email ?? null,
  }));

  return {
    ...(householdResult.data as Household),
    members,
    currentUserRole: membership.role as 'admin' | 'member',
  };
}

export async function getPendingInvitations(): Promise<PendingInvitation[]> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data } = await supabase
    .from('household_members')
    .select('household_id, created_at, households(name), invited_email, households(created_by(email))')
    .eq('status', 'pending')
    .or(`user_id.eq.${user.id},invited_email.eq.${user.email ?? ''}`)
    .order('created_at', { ascending: true });

  if (!data) return [];

  return data.map((row) => ({
    household_id: row.household_id as string,
    household_name: (row as { households?: { name?: string } }).households?.name ?? 'Unknown Household',
    invited_by: (row as {households:{created_by?:{email:string}}}).households?.created_by?.email??"Unknown user",           // works correctly if user email is defined.
    created_at: row.created_at as string,
  }));
}

export async function getHouseholdMeals(limit = 20) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return [];

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) return [];

  const { data, error } = await supabase
    .from('meal_logs')
    .select('*, meal_participants(user_id, dismissed)')
    .eq('is_shared', true)
    .eq('household_id', membership.household_id)
    .order('eaten_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching household meals:', error);
    return [];
  }

  return data ?? [];
}
