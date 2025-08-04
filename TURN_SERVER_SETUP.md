# TURN Server Setup Guide for VokChat

## Why TURN Servers?

TURN (Traversal Using Relays around NAT) servers are essential for WebRTC applications when:
- Users are behind restrictive firewalls
- Users are in different geographical locations (like Delhi and Pune)
- Direct peer-to-peer connections fail due to NAT traversal issues

## Quick Setup Options

### Option 1: Use Free TURN Servers (Testing Only)
The app now includes free TURN servers from openrelay.metered.ca. These are good for testing but have limited bandwidth.

### Option 2: Commercial TURN Services (Recommended for Production)

#### A. Twilio TURN Service
1. Sign up at [Twilio](https://www.twilio.com/)
2. Get your TURN credentials
3. Update `src/turnConfig.js`:

```javascript
export const turnServers = [
  {
    urls: 'turn:global.turn.twilio.com:3478?transport=udp',
    username: 'your-twilio-username',
    credential: 'your-twilio-password'
  },
  {
    urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
    username: 'your-twilio-username',
    credential: 'your-twilio-password'
  },
  {
    urls: 'turn:global.turn.twilio.com:443?transport=tcp',
    username: 'your-twilio-username',
    credential: 'your-twilio-password'
  }
];
```

#### B. Coturn (Self-Hosted)
1. Deploy a Coturn server on a cloud provider
2. Configure with your domain
3. Update credentials in `src/turnConfig.js`

### Option 3: AWS TURN Service
1. Use AWS Global Accelerator with TURN servers
2. Deploy in multiple regions for better latency

## Configuration Steps

1. **Update TURN Credentials**
   - Edit `src/turnConfig.js`
   - Add your TURN server credentials
   - Uncomment the relevant sections

2. **Test Connectivity**
   - Deploy the updated app
   - Test between users in different locations
   - Monitor the connection quality indicator

3. **Monitor Performance**
   - Check browser console for ICE connection states
   - Use the connection quality indicator in the UI
   - Monitor TURN server usage

## Expected Improvements

With proper TURN servers, you should see:
- ✅ Reduced connection time (5-10 seconds vs 30+ seconds)
- ✅ Better success rate for distant users (95%+ vs 60%)
- ✅ Lower latency (100-200ms vs 500ms+)
- ✅ More stable connections during network changes

## Cost Considerations

- **Free TURN servers**: Limited bandwidth, good for testing
- **Commercial services**: $0.01-0.05 per GB, suitable for production
- **Self-hosted**: Infrastructure costs but unlimited usage

## Troubleshooting

1. **Connection still failing**: Check TURN server credentials
2. **High latency**: Consider TURN servers closer to your users
3. **Authentication errors**: Verify username/password format
4. **Bandwidth issues**: Monitor usage and upgrade if needed

## Security Notes

- Never commit TURN credentials to public repositories
- Use environment variables for production
- Rotate credentials regularly
- Monitor for abuse

## Next Steps

1. Test with the current free TURN servers
2. If performance is still poor, consider commercial TURN services
3. Monitor connection quality in the app
4. Consider deploying TURN servers in multiple regions for global users 