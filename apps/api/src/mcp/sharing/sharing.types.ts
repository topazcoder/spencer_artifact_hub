/** The kinds of access `share_artifact` grants. */
export type ShareTarget = 'people' | 'company' | 'link';

/** What `manage_access` can do. */
export type ManageAccessAction =
  'list' | 'remove_person' | 'turn_off_company' | 'turn_off_link' | 'reset_link';
