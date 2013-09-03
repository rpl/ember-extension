import FirefoxPort from "port-firefox";
import ChromePort from "port-chrome";

var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;

var Port;

if (is_chrome) {
  Port = ChromePort;
} else {
  Port = FirefoxPort;
}

export default Port;
