/** Web stub — MediaLibrary is skipped when Platform.OS === 'web'. */
module.exports = {
  requestPermissionsAsync: async () => ({ granted: false, status: 'denied' }),
  Asset: {
    create: async () => {
      throw new Error('MediaLibrary unavailable on web');
    },
  },
};
