# U--lux-node.js
my node.js script for handling the u::lux switch

Still quite proprietary, might never change. It handles the u::lux initialization routines, can update real values and edit values from MQTT
very proprietary way to uload pictures, it has has the actor-id and page-id of the page with the picture more or less hardcoded
During init, the page with the picture is flowed to via a dummy page, to get the dimensions of the picture placeholder
these dimension are used to downscale the picture.
Transformation to JPEG to RGB565 raw is built in.

Feel free to use whatever you think is usefull.
