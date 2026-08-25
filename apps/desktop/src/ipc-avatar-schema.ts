import { z } from 'zod';

const MAX_AVATAR_REFERENCE_LENGTH = 4096;
const MAX_INLINE_IMAGE_AVATAR_LENGTH = 20_000_000;

export const avatarSchema = z.union([
  z.string().max(MAX_AVATAR_REFERENCE_LENGTH),
  z
    .string()
    .max(MAX_INLINE_IMAGE_AVATAR_LENGTH)
    .regex(/^data:image\//),
]);
