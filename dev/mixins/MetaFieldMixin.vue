<script>
import MaketextMixin from './MaketextMixin.vue';
import RandomString from "randomstring";
export default {
    mixins: [MaketextMixin],
    data(){
        return{
            showValidationWarnings: false
        };
    },
    props: ['fieldName', 'fields', 'autoAssigns'],
    computed: {
        //Standard behaviour to check validity
        isValid() {
            return !(this.fields[this.fieldName].mandatory && !this.fields[this.fieldName].value);
        },
        id() {
            return RandomString.generate();
        },
        isAutoAssigned(){
            if(this.autoAssigns)
                return (this.autoAssigns[this.fieldName] !== undefined);
            else
                return false;
        }
    },
    watch: {
        //A watcher to propagate validity information to the state.
        //This can then be read by the parent component.
        isValid(){
            this.showValidationWarnings = !this.isValid;
            this.fields[this.fieldName].isValid = this.isValid;
        },
        //This is set from outside to indicate to all fields to show
        //their warnings.
        "fields.showValidationWarnings": function(){
            this.showValidationWarnings = true;
        },
        isAutoAssigned(){
            if(this.isAutoAssigned){
                this.fields[this.fieldName].value = this.autoAssigns[this.fieldName];
            }
            else{
                this.fields[this.fieldName].value = "";
            }
        }
    },
    created(){
        //Unfortunately we have to set validity state manually after init as
        //the watcher above does not trigger when the computed property
        //is initially set.
        this.fields[this.fieldName].isValid = this.isValid;
    }
};
</script>
