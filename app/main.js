import App from "application";
import TreeNodeControllerView from "views/tree_node_controller";
import PropertyFieldView from "views/property_field" ;
import DragHandleComponent from "components/drag_handle";
import Port from "port";

var EmberExtension;

EmberExtension = App.create();
EmberExtension.TreeNodeControllerView = TreeNodeControllerView;
EmberExtension.PropertyFieldView = PropertyFieldView;
EmberExtension.DragHandleComponent = DragHandleComponent;
EmberExtension.Port = Port;

export default EmberExtension;
